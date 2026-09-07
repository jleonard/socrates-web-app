import * as Sentry from "@sentry/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Dropbox } from "dropbox";
import { ActionFunctionArgs, data } from "react-router";
import type { DropboxAssetRow } from "~/types";
import type { Json } from "~/types/supabase";
import { deleteByIds } from "~/utils/pinecone";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";

/**
 * Dropbox webhook/sync endpoint.
 *
 * The general strategy here is:
 *
 * 1. Get all changes from Dropbox using the saved cursor.
 * 2. Classify the changes into:
 *    - metadata files
 *    - added/modified files
 *    - deleted files
 * 3. Batch Supabase operations wherever possible.
 * 4. Batch Pinecone deletion across all deleted files.
 * 5. Only advance the Dropbox cursor if everything succeeded.
 *
 * Keeping database operations outside of per-file loops is important.
 * A Dropbox sync can contain hundreds of files, and we want the number
 * of Supabase/Pinecone requests to stay roughly constant as that number grows.
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  if (request.headers.get("x-api-key") !== "wonderway-2026") {
    return data({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dbx = new Dropbox({
      clientId: process.env.DROPBOX_APP_KEY,
      clientSecret: process.env.DROPBOX_APP_SECRET,
      refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
    });

    const { supabase: supabaseServiceRole } = getSupabaseServiceRoleClient();

    /*
     * Get the cursor from the previous successful sync.
     *
     * The cursor lets Dropbox return only changes since the previous sync
     * instead of scanning the entire folder every time.
     */
    const { data: cursorRow, error: cursorError } = await supabaseServiceRole
      .from("dropbox_sync_cursor")
      .select("cursor")
      .eq("id", 1)
      .single();

    if (cursorError) {
      throw cursorError;
    }

    /*
     * Dropbox may return multiple pages of changes.
     * gatherChanges() handles the pagination and gives us the cursor
     * representing the end of this sync.
     */
    const { entries, cursor } = await gatherChanges(
      cursorRow?.cursor ?? null,
      dbx,
    );

    const processingErrors: string[] = [];

    /*
     * Ignore folders. We only process actual files and deleted files.
     *
     * Dropbox represents deleted folders as deleted entries without a
     * filename extension. Those are ignored because individual files
     * underneath them will be reported separately when appropriate.
     */
    const allFiles = entries.filter((entry) => {
      if (entry[".tag"] === "folder") {
        return false;
      }

      if (entry[".tag"] === "deleted" && !entry.name.includes(".")) {
        return false;
      }

      return true;
    });

    /*
     * Add the containing Dropbox folder to every file.
     *
     * Example:
     *   /wonderway rag/exhibition/images/photo.jpg
     *
     * becomes:
     *   dropbox_folder =
     *   /wonderway rag/exhibition/images
     */
    const filesToProcess = allFiles
      .filter(
        (entry): entry is typeof entry & { path_lower: string } =>
          !!entry.path_lower,
      )
      .map((file) => {
        const parts = file.path_lower.split("/");
        parts.pop();

        const dropbox_folder = parts.join("/");

        return {
          ...file,
          dropbox_folder,
        };
      });

    /*
     * Separate active files from deleted files.
     */
    const filesToAdd = filesToProcess.filter(
      (entry) => entry[".tag"] !== "deleted",
    );

    const filesToDelete = filesToProcess.filter(
      (entry) => entry[".tag"] === "deleted",
    );

    // ---------------------------------------------------------------------
    // METADATA
    // ---------------------------------------------------------------------

    /*
     * metadata.json controls the metadata inherited by files in its folder.
     *
     * A metadata change therefore means that sibling files and descendants
     * may need to be reprocessed.
     */
    const metadata = filesToAdd.filter(
      (file): file is typeof file & { path_lower: string } =>
        file.name === "metadata.json" && !!file.path_lower,
    );

    /*
     * Multiple metadata.json files may exist in one sync.
     *
     * We only need to invalidate each folder once, so use a Set to
     * eliminate duplicate folders.
     */
    const metadataFolders = [
      ...new Set(metadata.map((file) => file.dropbox_folder)),
    ];

    if (metadataFolders.length > 0) {
      try {
        /*
         * One Supabase UPDATE replaces one UPDATE per metadata file.
         */
        await markFoldersForReprocessing(metadataFolders, supabaseServiceRole);
      } catch (error) {
        processingErrors.push(
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    /*
     * Dropbox does not provide a bulk file-download operation, so these
     * downloads necessarily happen individually.
     *
     * However, we don't write each result to Supabase individually.
     * Instead we collect all metadata records and perform one bulk upsert
     * after the downloads are complete.
     */
    const metadataRecords: DropboxAssetRow[] = [];

    for (const file of metadata) {
      try {
        const response = await dbx.filesDownload({
          path: file.path_lower,
        });

        /*
         * Dropbox returns the downloaded contents as a Buffer in our
         * server environment.
         */
        const fileBinary = (response.result as any).fileBinary as Buffer;

        const text = fileBinary.toString("utf-8");
        const metadataJson = JSON.parse(text) as Json;

        metadataRecords.push({
          name: file.name,
          modified_time: new Date().toISOString(),
          dropbox_path: file.path_lower,
          dropbox_folder: file.dropbox_folder,
          metadata: metadataJson,
          dropbox_file_id: file.id,
          status: "process",
        });
      } catch (error) {
        processingErrors.push(
          `metadata file ${file.path_lower}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    /*
     * One Supabase request instead of one request per metadata file.
     */
    if (metadataRecords.length > 0) {
      const { error } = await supabaseServiceRole
        .from("dropbox_assets")
        .upsert(metadataRecords, {
          onConflict: "dropbox_path",
        });

      if (error) {
        processingErrors.push(`Failed to upsert metadata: ${error.message}`);
      }
    }

    // ---------------------------------------------------------------------
    // ADDED / MODIFIED FILES
    // ---------------------------------------------------------------------

    /*
     * metadata.json is stored separately above because its contents need
     * to be parsed and saved to the metadata column.
     *
     * Every other file is simply marked for processing.
     */
    const files = filesToAdd.filter((file) => file.name !== "metadata.json");

    /*
     * Build all records in memory first.
     *
     * Supabase/PostgREST accepts an array for upsert(), allowing all changed
     * files to be written with a single database request.
     */
    const fileRecords: DropboxAssetRow[] = files.map((file) => ({
      name: file.name,
      modified_time: new Date().toISOString(),
      dropbox_file_id: file.id,
      dropbox_folder: file.dropbox_folder,
      dropbox_path: file.path_lower,
      status: "process",
    }));

    if (fileRecords.length > 0) {
      const { error } = await supabaseServiceRole
        .from("dropbox_assets")
        .upsert(fileRecords, {
          onConflict: "dropbox_path",
        });

      if (error) {
        processingErrors.push(`Failed to upsert files: ${error.message}`);
      }
    }

    // ---------------------------------------------------------------------
    // DELETED FILES
    // ---------------------------------------------------------------------

    /*
     * Deletions are intentionally handled as a batch.
     *
     * Previously each deleted file required:
     *
     *   1. Supabase DELETE content_locations
     *   2. Supabase SELECT dropbox_assets
     *   3. Pinecone deletion
     *   4. Supabase DELETE dropbox_assets
     *
     * With 50 deleted files, that could result in hundreds of requests.
     *
     * Instead:
     *
     *   1. Fetch all affected assets in one query.
     *   2. Collect all Pinecone IDs.
     *   3. Delete those vectors in batches.
     *   4. Delete all content_locations in one query.
     *   5. Delete all dropbox_assets in one query.
     */
    const deletedPaths = filesToDelete
      .map((file) => file.path_lower)
      .filter((path): path is string => typeof path === "string");

    if (deletedPaths.length > 0) {
      /*
       * Fetch the Pinecone IDs before deleting the Supabase records.
       *
       * We only select the columns we actually need instead of SELECT *.
       */
      const { data: deletedAssets, error: recordError } =
        await supabaseServiceRole
          .from("dropbox_assets")
          .select("dropbox_path, pinecone_ids")
          .in("dropbox_path", deletedPaths);

      if (recordError) {
        processingErrors.push(
          `Failed to find deleted assets: ${recordError.message}`,
        );
      } else {
        /*
         * A file can potentially have multiple Pinecone vectors.
         *
         * Flatten all IDs from all deleted files and remove duplicates.
         */
        const pineconeIds = [
          ...new Set(
            deletedAssets.flatMap((asset) => asset.pinecone_ids ?? []),
          ),
        ];

        /*
         * deleteByIds() handles the configured Pinecone namespaces and
         * batches the IDs into Pinecone deleteMany() requests.
         *
         * This is one logical deletion operation for the entire sync,
         * rather than one operation per Dropbox file.
         */
        if (pineconeIds.length > 0) {
          try {
            await deleteByIds("wonderway", pineconeIds);
          } catch (error) {
            processingErrors.push(
              `Failed to delete Pinecone vectors: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }

        /*
         * Delete all associated content_locations in one Supabase request.
         */
        const { error: locationError } = await supabaseServiceRole
          .from("content_locations")
          .delete()
          .in("dropbox_path", deletedPaths);

        if (locationError) {
          processingErrors.push(
            `Failed to delete content locations: ${locationError.message}`,
          );
        }

        /*
         * Finally remove all deleted Dropbox assets in one request.
         */
        const { error: assetDeleteError } = await supabaseServiceRole
          .from("dropbox_assets")
          .delete()
          .in("dropbox_path", deletedPaths);

        if (assetDeleteError) {
          processingErrors.push(
            `Failed to delete Dropbox assets: ${assetDeleteError.message}`,
          );
        }
      }
    }

    // ---------------------------------------------------------------------
    // CURSOR
    // ---------------------------------------------------------------------

    /*
     * Do NOT advance the cursor if anything failed.
     *
     * This allows the next sync to retry the same Dropbox changes instead
     * of permanently losing them.
     */
    if (processingErrors.length > 0) {
      console.error(
        "Dropbox sync completed with errors, cursor not advanced:",
        processingErrors,
      );

      return data(
        {
          error: "Partial failure",
          details: processingErrors,
        },
        { status: 207 },
      );
    }

    /*
     * Everything succeeded, so we can safely advance the Dropbox cursor.
     */
    const { error: cursorUpdateError } = await supabaseServiceRole
      .from("dropbox_sync_cursor")
      .update({
        cursor,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (cursorUpdateError) {
      throw cursorUpdateError;
    }

    return data({
      success: true,
      processed: files.length + metadata.length,
      deleted: deletedPaths.length,
    });
  } catch (error) {
    Sentry.captureException(error);

    console.error("Dropbox sync failed:", error);

    return data({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Retrieve all changes from Dropbox since the supplied cursor.
 *
 * Dropbox pagination is intentionally handled sequentially because each
 * continuation request requires the cursor returned by the previous request.
 */
async function gatherChanges(cursor: string | null, dbx: Dropbox) {
  let result;

  if (cursor) {
    try {
      console.log("Using Dropbox cursor");

      result = await dbx.filesListFolderContinue({
        cursor,
      });
    } catch (error: any) {
      /*
       * Dropbox can invalidate an old cursor. When that happens we fall
       * back to a complete recursive scan.
       */
      if (error?.error?.[".tag"] !== "reset") {
        throw error;
      }

      console.log("Dropbox cursor was reset. Starting full scan.");

      result = await dbx.filesListFolder({
        path: "/wonderway rag",
        recursive: true,
        include_deleted: true,
      });
    }
  } else {
    console.log("No Dropbox cursor. Starting initial full scan.");

    result = await dbx.filesListFolder({
      path: "/wonderway rag",
      recursive: true,
      include_deleted: true,
    });
  }

  /*
   * Collect entries from every Dropbox page.
   */
  const entries = [...result.result.entries];

  let newCursor = result.result.cursor;
  let hasMore = result.result.has_more;

  while (hasMore) {
    const next = await dbx.filesListFolderContinue({
      cursor: newCursor,
    });

    entries.push(...next.result.entries);

    newCursor = next.result.cursor;
    hasMore = next.result.has_more;

    console.log("Fetched Dropbox entries:", entries.length);
  }

  return {
    entries,
    cursor: newCursor,
  };
}

/**
 * Mark all assets belonging to the supplied folders (and their descendants)
 * as needing processing.
 *
 * A metadata.json file can change inherited metadata for an entire subtree.
 *
 * This function intentionally accepts multiple folders so all affected
 * folders can be updated with a single Supabase request.
 */
async function markFoldersForReprocessing(
  dropboxFolders: string[],
  supabaseServiceRole: SupabaseClient,
) {
  if (dropboxFolders.length === 0) {
    return;
  }

  /*
   * Build a PostgREST OR expression:
   *
   *   folder = /foo
   *   OR folder LIKE /foo/*
   *   OR folder = /bar
   *   OR folder LIKE /bar/*
   */
  const filters = dropboxFolders.flatMap((folder) => [
    `dropbox_folder.eq.${folder}`,
    `dropbox_folder.like.${folder}/*`,
  ]);

  const { error } = await supabaseServiceRole
    .from("dropbox_assets")
    .update({ status: "process" })
    .or(filters.join(","));

  if (error) {
    throw new Error(
      `Failed to mark folders for reprocessing: ${error.message}`,
    );
  }
}
