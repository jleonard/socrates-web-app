import * as Sentry from "@sentry/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Dropbox } from "dropbox";
import { ActionFunctionArgs, data } from "react-router";
import type { DropboxAssetRow } from "~/types";
import type { Json } from "~/types/supabase";
import { deleteByIds } from "~/utils/pinecone";
import { describeImage } from "~/utils/ragIngest/vision.server";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";

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

    /* Get the saved Dropbox cursor */
    const { data: cursorRow, error: cursorError } = await supabaseServiceRole
      .from("dropbox_sync_cursor")
      .select("cursor")
      .eq("id", 1)
      .single();

    if (cursorError) {
      throw cursorError;
    }

    const { entries, cursor } = await gatherChanges(
      cursorRow?.cursor ?? null,
      dbx,
    );

    const processingErrors: string[] = [];

    /* filter entries */
    let allFiles = entries.filter((entry) => {
      if (entry[".tag"] === "folder") {
        return false;
      } // skip folders
      if (entry[".tag"] === "deleted" && !entry.name.includes(".")) {
        return false;
      } // skip deleted folders
      return true;
    });

    /* add dropbox_folder property */
    const filesToProcess = allFiles
      .filter(
        (entry): entry is typeof entry & { path_lower: string } =>
          !!entry.path_lower,
      )
      .map((file) => {
        const parts = file.path_lower.split("/");
        parts.pop(); // drop the filename, leaving just the folder path
        const dropbox_folder = parts.join("/");
        return Object.assign({}, file, { dropbox_folder });
      });

    const filesToAdd = filesToProcess.filter(
      (entry) => entry[".tag"] !== "deleted",
    );

    /* process metadata */
    const metadata = filesToAdd.filter(
      (file): file is typeof file & { path_lower: string } =>
        file.name === "metadata.json" && !!file.path_lower,
    );

    for (const file of metadata) {
      try {
        // invalidate siblings and descendants */
        await markSiblingsAndDescendantsForReprocessing(
          file.dropbox_folder,
          supabaseServiceRole,
        );

        const response = await dbx.filesDownload({
          path: file.path_lower,
        });

        // Dropbox returns the file contents as a Buffer/Blob depending on environment.
        const fileBinary = (response.result as any).fileBinary as Buffer;
        const text = fileBinary.toString("utf-8");
        const metadataJson = JSON.parse(text);
        // todo upsert to supabase
        await saveMetadataToFolder(
          {
            id: file.id,
            name: file.name,
            modified_time: new Date().toISOString(),
            path_lower: file.path_lower,
            dropbox_folder: file.dropbox_folder,
          },
          metadataJson,
          supabaseServiceRole,
        );
      } catch (error) {
        processingErrors.push(
          `metadata file ${file.path_lower}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    /* process upsert files */
    const files = filesToAdd.filter((file) => {
      return file["name"] !== "metadata.json";
    });

    for (const file of files) {
      const { error } = await supabaseServiceRole.from("dropbox_assets").upsert(
        {
          name: file.name,
          modified_time: new Date().toISOString(),
          dropbox_file_id: file.id,
          dropbox_folder: file.dropbox_folder,
          dropbox_path: file.path_lower,
          status: "process",
        } satisfies DropboxAssetRow,
        { onConflict: "dropbox_file_id" },
      );
      if (error) {
        processingErrors.push(`file ${file.path_lower}: ${error.message}`);
      }
    }

    /* process deleted files */
    const filesToDelete = filesToProcess.filter(
      (entry) => entry[".tag"] === "deleted",
    );

    for (const file of filesToDelete) {
      // delete any content_locations with matching dropbox_file_id
      const { error: locationError } = await supabaseServiceRole
        .from("content_locations")
        .delete()
        .eq("dropbox_path", file.path_lower);

      const { data, error: recordError } = await supabaseServiceRole
        .from("dropbox_assets")
        .select("*")
        .eq("dropbox_path", file.path_lower)
        .single();
      const record = data as DropboxAssetRow;
      if (record.pinecone_ids && record.pinecone_ids.length > 0) {
        await deleteByIds("wonderway", record.pinecone_ids);
      }
      if (recordError) {
        processingErrors.push(
          `file ${file.path_lower}: ${recordError.message}`,
        );
      }

      const { error } = await supabaseServiceRole
        .from("dropbox_assets")
        .delete()
        .eq("dropbox_path", file.path_lower);
      if (error) {
        processingErrors.push(`file ${file.path_lower}: ${error.message}`);
      }
      if (locationError) {
        processingErrors.push(
          `file ${file.path_lower}: ${locationError.message}`,
        );
      }
    }

    /* only advance the cursor if every step succeeded */
    if (processingErrors.length > 0) {
      console.error(
        "Dropbox sync completed with errors, cursor not advanced:",
        processingErrors,
      );
      return data(
        { error: "Partial failure", details: processingErrors },
        { status: 207 },
      );
    }

    /* advance the cursor */
    const { error: cursorUpdateError } = await supabaseServiceRole
      .from("dropbox_sync_cursor")
      .update({ cursor, updated_at: new Date().toISOString() })
      .eq("id", 1);

    if (cursorUpdateError) {
      throw cursorUpdateError;
    }

    return data({ success: true, processed: files.length + metadata.length });
  } catch (error) {
    Sentry.captureException(error);

    console.error("Dropbox sync failed:", error);

    return data({ error: "Internal server error" }, { status: 500 });
  }
}

/* paginates through all dropbox changes */
async function gatherChanges(cursor: string | null, dbx: Dropbox) {
  let result;
  if (cursor) {
    try {
      console.log("Using Dropbox cursor");
      result = await dbx.filesListFolderContinue({
        cursor,
      });
    } catch (error: any) {
      if (error?.error?.[".tag"] !== "reset") {
        throw error;
      }

      console.log("Dropbox cursor was reset. Starting full scan.");

      result = await dbx.filesListFolder({
        path: "/wonderway rag/boundary",
        recursive: true,
        include_deleted: true,
      });
    }
  } else {
    console.log("No Dropbox cursor. Starting initial full scan.");

    result = await dbx.filesListFolder({
      path: "/wonderway rag/boundary",
      recursive: true,
      include_deleted: true,
    });
  }

  /* paginate */
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
  return { entries, cursor: newCursor };
}

interface FileData {
  id: string;
  name: string;
  modified_time: string;
  path_lower: string;
  dropbox_folder: string;
}

async function saveMetadataToFolder(
  file: FileData,
  metadataJson: Json | null,
  supabaseServiceRole: SupabaseClient,
) {
  const record = {
    name: file.name,
    modified_time: file.modified_time,
    dropbox_path: file.path_lower,
    dropbox_folder: file.dropbox_folder,
    metadata: metadataJson,
    dropbox_file_id: file.id,
    status: "process",
  } satisfies DropboxAssetRow;

  const { error } = await supabaseServiceRole
    .from("dropbox_assets")
    .upsert(record, { onConflict: "dropbox_file_id" });

  if (error) {
    throw new Error(`Failed to save metadata to folder: ${error.message}`);
  }
}

async function markSiblingsAndDescendantsForReprocessing(
  dropboxFolder: string,
  supabaseServiceRole: SupabaseClient,
) {
  const { error } = await supabaseServiceRole
    .from("dropbox_assets")
    .update({ status: "process" })
    .or(
      `dropbox_folder.eq.${dropboxFolder},dropbox_folder.like.${dropboxFolder}/*`,
    );

  if (error) {
    throw new Error(
      `Failed to mark siblings/descendants for reprocessing: ${error.message}`,
    );
  }
}
