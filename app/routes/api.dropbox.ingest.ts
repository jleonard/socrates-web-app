import * as Sentry from "@sentry/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Dropbox } from "dropbox";
import { ActionFunctionArgs, data } from "react-router";
import type { DropboxAssetRow } from "~/types";
import type { Json } from "~/types/supabase";
import { bumpContentVersions } from "~/utils/cache/content.version.server";
import { deleteFromIngestIndexes } from "~/utils/pinecone";
import { isIgnoredPath } from "~/utils/ragIngest/ignored.path";
import { LIBRARIES_FILE, parseLibrariesFile } from "~/utils/ragIngest/library";
import {
  InvalidRoomFile,
  type RoomFileKind,
  roomFileKind,
  roomIdFromMetadata,
} from "~/utils/ragIngest/room";
import {
  type RoomDefinition,
  applyRoomFile,
  clearRoomFile,
  dropboxOwned,
  removeRooms,
  syncRooms,
} from "~/utils/ragIngest/room.server";
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

      // Staging and review folders: never recorded, never ingested.
      if (isIgnoredPath(entry.path_lower)) {
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

    /*
     * Downloaded a few at a time: one by one, a sync that adds a place's
     * worth of folders (hundreds of metadata.json files) ran past the
     * function's time limit, so the cursor never advanced and every run
     * retried the same batch.
     */
    await forEachConcurrently(metadata, METADATA_CONCURRENCY, async (file) => {
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

        /*
         * A content problem in one file must not hold back the cursor:
         * retrying can't fix it, and every later change in the folder
         * would wait behind it. Fixing the file in Dropbox is a new change
         * that brings it back here. An empty file (just created) is no
         * metadata; invalid JSON is reported and skipped, keeping any
         * metadata stored for it before.
         */
        let metadataJson: Json;
        try {
          metadataJson = text.trim() ? (JSON.parse(text) as Json) : {};
        } catch (error) {
          const message = `Invalid metadata.json skipped: ${file.path_lower}`;
          console.error(message, error);
          Sentry.captureMessage(message, "warning");
          return;
        }

        metadataRecords.push({
          name: file.name,
          modified_time: new Date().toISOString(),
          dropbox_path: file.path_lower,
          dropbox_folder: file.dropbox_folder,
          metadata: metadataJson,
          dropbox_file_id: file.id,
          // metadata.json is config, not content: never queued for push-changes
          status: "ignore",
        });
      } catch (error) {
        processingErrors.push(
          `metadata file ${file.path_lower}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });

    /*
     * One Supabase request instead of one request per metadata file.
     */
    /*
     * The room each changed metadata.json defined before this sync, so a
     * room whose exhibition_id was removed or changed can be retired.
     */
    const previousRoomIds = new Map<string, string>();
    for (const batch of batches(
      metadataRecords.map((r) => r.dropbox_file_id).filter((id): id is string => !!id),
      PATH_BATCH,
    )) {
      const { data: previous, error } = await supabaseServiceRole
        .from("dropbox_assets")
        .select("dropbox_file_id, metadata")
        .in("dropbox_file_id", batch);
      if (error) {
        processingErrors.push(`Failed to read previous metadata: ${describeError(error)}`);
        break;
      }
      for (const row of previous ?? []) {
        const id = roomIdFromMetadata(row.metadata);
        if (id && row.dropbox_file_id) previousRoomIds.set(row.dropbox_file_id, id);
      }
    }

    if (metadataRecords.length > 0) {
      const { error } = await supabaseServiceRole
        .from("dropbox_assets")
        .upsert(metadataRecords, {
          onConflict: "dropbox_file_id",
        });

      if (error) {
        processingErrors.push(`Failed to upsert metadata: ${error.message}`);
      }
    }

    // ---------------------------------------------------------------------
    // LIBRARY SUBSCRIPTIONS
    // ---------------------------------------------------------------------

    /*
     * libraries.json lists the shared libraries a place or exhibition uses:
     *   {"libraries": ["lib-ancient-egypt", …]}
     *
     * Unlike metadata.json it is not inherited and re-queues nothing (no
     * content changes), so editing a list never re-embeds the venue. Its
     * place and exhibition come from the metadata.json files above it, read
     * now (after this sync's metadata was stored) and saved on the row, so
     * the guide finds a place's lists with one query. Moving the file to
     * another folder re-resolves it; changing an ancestor's ids does not,
     * so re-save the file in that case.
     */
    const librariesFiles = filesToAdd.filter(
      (file): file is typeof file & { path_lower: string } =>
        file.name === LIBRARIES_FILE && !!file.path_lower,
    );
    const librariesRecords: DropboxAssetRow[] = [];
    const subscriptionLocations: string[] = [];

    await forEachConcurrently(
      librariesFiles,
      METADATA_CONCURRENCY,
      async (file) => {
        try {
          const response = await dbx.filesDownload({ path: file.path_lower });
          const text = (
            response.result as unknown as { fileBinary: Buffer }
          ).fileBinary.toString("utf-8");

          // Content problems are reported and skipped, like metadata.json:
          // retrying can't fix them and the cursor must keep moving.
          let libraries: string[];
          try {
            libraries = parseLibrariesFile(
              text.trim() ? JSON.parse(text) : { libraries: [] },
              file.path_lower,
            );
          } catch (error) {
            const message = `Invalid libraries.json skipped: ${file.path_lower}`;
            console.error(message, error);
            Sentry.captureMessage(message, "warning");
            return;
          }

          const inherited = await mergedMetadataForFolder(
            file.dropbox_folder,
            supabaseServiceRole,
          );
          const placeId = stringOrNull(inherited.place_id);
          const exhibitionId = stringOrNull(inherited.exhibition_id);
          if (!placeId) {
            const message = `libraries.json outside a place skipped: ${file.path_lower}`;
            console.error(message);
            Sentry.captureMessage(message, "warning");
            return;
          }

          librariesRecords.push({
            name: file.name,
            modified_time: new Date().toISOString(),
            dropbox_path: file.path_lower,
            dropbox_folder: file.dropbox_folder,
            metadata: {
              libraries,
              place_id: placeId,
              ...(exhibitionId ? { exhibition_id: exhibitionId } : {}),
            },
            dropbox_file_id: file.id,
            // config, not content: never queued for push-changes
            status: "ignore",
          } as DropboxAssetRow);
          subscriptionLocations.push(exhibitionId ?? placeId);
        } catch (error) {
          processingErrors.push(
            `libraries file ${file.path_lower}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      },
    );

    if (librariesRecords.length > 0) {
      const { error } = await supabaseServiceRole
        .from("dropbox_assets")
        .upsert(librariesRecords, { onConflict: "dropbox_file_id" });

      if (error) {
        processingErrors.push(
          `Failed to upsert libraries.json: ${error.message}`,
        );
      } else {
        // What the guide can answer there changed: retire cached answers.
        await bumpContentVersions(subscriptionLocations);
      }
    }

    // ---------------------------------------------------------------------
    // ROOMS (Dropbox-defined exhibitions, see utils/ragIngest/room.ts)
    // ---------------------------------------------------------------------

    /*
     * A folder whose own metadata.json sets exhibition_id is a room: its
     * location_relationships row comes from here, and its reserved settings
     * files (prompt.md, greeting.txt, mispronunciations.json, card.txt,
     * card.jpg) are applied instead of embedded. Rooms Strapi defines are
     * left to Strapi.
     */
    const roomFilePaths = new Set<string>();
    // rooms this sync defines (they survive a delete of an old path below)
    const definedRoomIds = new Set<string>();
    // `${exhibitionId}:${kind}` applied in this sync
    const appliedRoomFiles = new Set<string>();

    try {
      const roomDefs: (RoomDefinition & { folder: string })[] = [];
      const retired: string[] = [];

      for (const record of metadataRecords) {
        const id = roomIdFromMetadata(record.metadata);
        const previous = record.dropbox_file_id
          ? previousRoomIds.get(record.dropbox_file_id)
          : undefined;
        if (previous && previous !== id) retired.push(previous);
        if (!id || !record.dropbox_folder) continue;

        const inherited = await mergedMetadataForFolder(
          record.dropbox_folder,
          supabaseServiceRole,
        );
        const placeId = stringOrNull(inherited.place_id);
        if (!placeId) {
          const message = `Room outside a place skipped: ${record.dropbox_path}`;
          console.error(message);
          Sentry.captureMessage(message, "warning");
          continue;
        }
        definedRoomIds.add(id);
        roomDefs.push({
          exhibitionId: id,
          placeId,
          name: stringOrNull(
            (record.metadata as Record<string, unknown> | null)?.exhibition_name,
          ),
          folder: record.dropbox_folder,
        });
      }

      const removed = await removeRooms(
        supabaseServiceRole,
        retired.filter((id) => !definedRoomIds.has(id)),
      );
      const synced = await syncRooms(supabaseServiceRole, roomDefs);
      if (synced.strapi.length) {
        console.log(`[ingest] rooms managed in Strapi, left alone: ${synced.strapi.join(", ")}`);
      }

      // Settings files to apply: this sync's, in room folders...
      type RoomFile = {
        kind: RoomFileKind;
        path: string;
        folder: string;
        fileId: string;
        exhibitionId: string;
        placeId: string;
      };
      const candidates = filesToAdd.filter(
        (file): file is typeof file & { path_lower: string } =>
          !!file.path_lower && !!roomFileKind(file.name),
      );
      const rooms = await roomsForFolders(
        [
          ...candidates.map((f) => f.dropbox_folder),
          ...roomDefs.filter((r) => synced.created.includes(r.exhibitionId)).map((r) => r.folder),
        ],
        supabaseServiceRole,
      );
      const toApply = new Map<string, RoomFile>();
      for (const file of candidates) {
        const room = rooms.get(file.dropbox_folder);
        if (!room) continue; // not a room folder: ordinary content
        toApply.set(file.path_lower, {
          kind: roomFileKind(file.name)!,
          path: file.path_lower,
          folder: file.dropbox_folder,
          fileId: file.id,
          ...room,
        });
      }

      // ...plus, for rooms created now, the settings files already there
      // (a renamed staging folder, or a room Strapi used to own). Anything
      // left from before is cleared first, and files that had been embedded
      // as content lose their vectors.
      const createdFolders = roomDefs
        .filter((r) => synced.created.includes(r.exhibitionId))
        .map((r) => r.folder);
      if (createdFolders.length) {
        for (const id of synced.created) {
          for (const kind of ["prompt", "greeting", "mispronunciations"] as const) {
            await clearRoomFile(supabaseServiceRole, kind, id);
          }
        }
        const staleVectors: string[] = [];
        for (const batch of batches(createdFolders, FOLDER_BATCH)) {
          const { data: existing, error } = await supabaseServiceRole
            .from("dropbox_assets")
            .select("name, dropbox_path, dropbox_folder, dropbox_file_id, pinecone_ids")
            .in("dropbox_folder", batch);
          if (error) throw new Error(`room files lookup: ${describeError(error)}`);
          for (const row of existing ?? []) {
            const kind = roomFileKind(row.name);
            const room = row.dropbox_folder ? rooms.get(row.dropbox_folder) : undefined;
            if (!kind || !room || !row.dropbox_path || !row.dropbox_file_id) continue;
            staleVectors.push(...(row.pinecone_ids ?? []));
            if (!toApply.has(row.dropbox_path)) {
              toApply.set(row.dropbox_path, {
                kind,
                path: row.dropbox_path,
                folder: row.dropbox_folder!,
                fileId: row.dropbox_file_id,
                ...room,
              });
            }
          }
        }
        if (staleVectors.length) await deleteFromIngestIndexes(staleVectors);
      }

      const owned = new Set([
        ...synced.owned,
        ...(await dropboxOwned(
          supabaseServiceRole,
          [...toApply.values()].map((f) => f.exhibitionId),
        )),
      ]);
      const roomFileRecords: DropboxAssetRow[] = [];

      await forEachConcurrently([...toApply.values()], METADATA_CONCURRENCY, async (file) => {
        roomFilePaths.add(file.path);
        const ownedHere = owned.has(file.exhibitionId);
        roomFileRecords.push({
          name: file.path.split("/").pop()!,
          modified_time: new Date().toISOString(),
          dropbox_path: file.path,
          dropbox_folder: file.folder,
          dropbox_file_id: file.fileId,
          // settings, not content: never queued for push-changes
          status: "ignore",
          pinecone_ids: [],
          metadata: {
            room_file: file.kind,
            exhibition_id: file.exhibitionId,
            ...(ownedHere ? {} : { skipped: "strapi" }),
          },
        });
        if (!ownedHere) return;

        const response = await dbx.filesDownload({ path: file.path });
        const content = (response.result as unknown as { fileBinary: Buffer }).fileBinary;
        try {
          const note = await applyRoomFile(supabaseServiceRole, { ...file, content });
          if (note) Sentry.captureMessage(note, "warning");
          appliedRoomFiles.add(`${file.exhibitionId}:${file.kind}`);
        } catch (error) {
          // invalid content can't be fixed by retrying: report and move on
          if (error instanceof InvalidRoomFile) {
            const message = `Invalid room file skipped: ${file.path}`;
            console.error(message, error);
            Sentry.captureMessage(message, "warning");
            return;
          }
          throw error;
        }
      });

      if (roomFileRecords.length) {
        const { error } = await supabaseServiceRole
          .from("dropbox_assets")
          .upsert(roomFileRecords, { onConflict: "dropbox_file_id" });
        if (error) throw new Error(`room files upsert: ${describeError(error)}`);
      }

      await bumpContentVersions([
        ...synced.owned,
        ...removed,
        ...[...toApply.values()].map((f) => f.exhibitionId),
      ]);
    } catch (error) {
      processingErrors.push(
        `rooms: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // ---------------------------------------------------------------------
    // ADDED / MODIFIED FILES
    // ---------------------------------------------------------------------

    /*
     * metadata.json and libraries.json are stored separately above because
     * their contents need to be parsed and saved to the metadata column.
     *
     * Every other file is simply marked for processing.
     */
    const files = filesToAdd.filter(
      (file) =>
        file.name !== "metadata.json" &&
        file.name !== LIBRARIES_FILE &&
        !roomFilePaths.has(file.path_lower ?? ""),
    );

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
          onConflict: "dropbox_file_id",
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
       * Paths go in the URL, so they're looked up in batches.
       */
      const pathBatches = batches(deletedPaths, PATH_BATCH);
      const deletedAssets: {
        name: string | null;
        dropbox_path: string | null;
        dropbox_folder: string | null;
        pinecone_ids: string[] | null;
        metadata: Json | null;
      }[] = [];
      let recordError: string | null = null;

      for (const batch of pathBatches) {
        const { data, error } = await supabaseServiceRole
          .from("dropbox_assets")
          .select("name, dropbox_path, dropbox_folder, pinecone_ids, metadata")
          .in("dropbox_path", batch);

        if (error) {
          recordError = describeError(error);
          break;
        }
        deletedAssets.push(...(data ?? []));
      }

      if (recordError) {
        processingErrors.push(`Failed to find deleted assets: ${recordError}`);
      } else {
        /*
         * Rooms: a deleted metadata.json that defined a room retires it
         * (unless this sync defines it again, e.g. the folder moved); a
         * deleted settings file undoes what it set.
         */
        try {
          const removedRooms = await removeRooms(
            supabaseServiceRole,
            deletedAssets
              .filter((a) => a.name === "metadata.json")
              .map((a) => roomIdFromMetadata(a.metadata))
              .filter((id): id is string => !!id && !definedRoomIds.has(id)),
          );
          const settings = deletedAssets
            .map((a) => (a.metadata ?? {}) as Record<string, unknown>)
            .filter(
              (m) =>
                typeof m.room_file === "string" &&
                typeof m.exhibition_id === "string" &&
                !m.skipped &&
                !removedRooms.includes(m.exhibition_id) &&
                !appliedRoomFiles.has(`${m.exhibition_id}:${m.room_file}`),
            ) as { room_file: RoomFileKind; exhibition_id: string }[];
          const owned = await dropboxOwned(
            supabaseServiceRole,
            settings.map((m) => m.exhibition_id),
          );
          for (const m of settings) {
            if (owned.has(m.exhibition_id)) {
              await clearRoomFile(supabaseServiceRole, m.room_file, m.exhibition_id);
            }
          }
          await bumpContentVersions([...removedRooms, ...settings.map((m) => m.exhibition_id)]);
        } catch (error) {
          processingErrors.push(
            `rooms (deleted files): ${error instanceof Error ? error.message : String(error)}`,
          );
        }

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
         * Deleted content changes what the guide can answer at its
         * locations, so retire their cached answers.
         */
        await bumpContentVersions(
          await locationIdsForFolders(
            deletedAssets.map((asset) => asset.dropbox_folder),
            supabaseServiceRole,
          ),
        );

        /*
         * deleteFromIngestIndexes() covers every ingest index and namespace and
         * batches the IDs into Pinecone deleteMany() requests.
         *
         * This is one logical deletion operation for the entire sync,
         * rather than one operation per Dropbox file.
         */
        if (pineconeIds.length > 0) {
          try {
            await deleteFromIngestIndexes(pineconeIds);
          } catch (error) {
            processingErrors.push(
              `Failed to delete Pinecone vectors: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }

        /*
         * Delete all associated content_locations, one request per batch
         * of paths.
         */
        for (const batch of pathBatches) {
          const { error: locationError } = await supabaseServiceRole
            .from("content_locations")
            .delete()
            .in("dropbox_path", batch);

          if (locationError) {
            processingErrors.push(
              `Failed to delete content locations: ${describeError(locationError)}`,
            );
            break;
          }
        }

        /*
         * Finally remove all deleted Dropbox assets, one request per batch.
         */
        for (const batch of pathBatches) {
          const { error: assetDeleteError } = await supabaseServiceRole
            .from("dropbox_assets")
            .delete()
            .in("dropbox_path", batch);

          if (assetDeleteError) {
            processingErrors.push(
              `Failed to delete Dropbox assets: ${describeError(assetDeleteError)}`,
            );
            break;
          }
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
      processed: files.length + metadata.length + librariesFiles.length,
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

/*
 * PostgREST filters (.or(), .in()) travel in the request URL, and a long
 * URL is rejected with an empty error message. A sync that adds a whole
 * place can touch hundreds of folders/paths, so filters are sent in
 * batches small enough to stay well under the limit (~6-8 KB each).
 */
const FOLDER_BATCH = 25;
const PATH_BATCH = 50;

/** Parallel metadata.json downloads; low enough to stay clear of Dropbox rate limits. */
const METADATA_CONCURRENCY = 8;

/** Runs `fn` over `items` with at most `limit` calls in flight. */
async function forEachConcurrently<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      await fn(items[next++]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
}

function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Drops folders that sit inside another folder in the list: the parent's
 * "LIKE parent/*" already covers them. e.g. a new place uploaded with a
 * metadata.json at its root collapses to that one folder.
 */
function outermostFolders(folders: string[]): string[] {
  const kept: string[] = [];
  for (const folder of [...folders].sort((a, b) => a.length - b.length)) {
    if (!kept.some((parent) => folder.startsWith(parent + "/"))) {
      kept.push(folder);
    }
  }
  return kept;
}

/** Supabase errors from an over-long URL have an empty message. */
function describeError(error: { message?: string; code?: string }) {
  return error.message || error.code || "no message (request may be too long)";
}

/**
 * Mark all assets belonging to the supplied folders (and their descendants)
 * as needing processing.
 *
 * A metadata.json file can change inherited metadata for an entire subtree.
 *
 * Folders covered by a parent in the list are dropped, and the rest are
 * updated in batches so the filter stays within the URL limit.
 */
async function markFoldersForReprocessing(
  dropboxFolders: string[],
  supabaseServiceRole: SupabaseClient,
) {
  if (dropboxFolders.length === 0) {
    return;
  }

  for (const batch of batches(outermostFolders(dropboxFolders), FOLDER_BATCH)) {
    /*
     * Build a PostgREST OR expression:
     *
     *   folder = /foo
     *   OR folder LIKE /foo/*
     *   OR folder = /bar
     *   OR folder LIKE /bar/*
     */
    const filters = batch.flatMap((folder) => [
      `dropbox_folder.eq.${folder}`,
      `dropbox_folder.like.${folder}/*`,
    ]);

    const { error } = await supabaseServiceRole
      .from("dropbox_assets")
      .update({ status: "process" })
      .or(filters.join(","))
      // config files (metadata.json, libraries.json) stay "ignore"
      .not("name", "in", `("metadata.json","${LIBRARIES_FILE}")`)
      // and so do room settings files (room.ts)
      .is("metadata->>room_file", null);

    if (error) {
      throw new Error(
        `Failed to mark ${batch.length} folders for reprocessing: ${describeError(error)}`,
      );
    }
  }
}

/**
 * Place and exhibition ids that apply to the given folders, read from the
 * metadata.json files in each folder and its ancestors. Never throws: a
 * failed lookup only means cached guide answers aren't retired.
 */
async function locationIdsForFolders(
  folders: (string | null)[],
  supabaseServiceRole: SupabaseClient,
): Promise<string[]> {
  const ancestors = new Set<string>();
  for (const folder of folders) {
    const parts = (folder ?? "").split("/").filter(Boolean);
    parts.forEach((_, i) =>
      ancestors.add("/" + parts.slice(0, i + 1).join("/")),
    );
  }
  if (ancestors.size === 0) return [];

  const rows: { metadata: Json }[] = [];
  for (const batch of batches([...ancestors], PATH_BATCH)) {
    const { data, error } = await supabaseServiceRole
      .from("dropbox_assets")
      .select("metadata")
      .eq("name", "metadata.json")
      .in("dropbox_folder", batch);

    if (error) {
      console.error(
        "[ingest] location lookup for deleted files failed",
        describeError(error),
      );
      return [];
    }
    rows.push(...(data ?? []));
  }

  const ids = new Set<string>();
  for (const row of rows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    for (const key of ["place_id", "exhibition_id", "library_id"]) {
      const id = metadata[key];
      if (typeof id === "string" && id) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Metadata a file in `folder` inherits: every metadata.json from the root
 * down to the folder, merged root → leaf (same as push-changes). Throws on
 * a database error.
 */
async function mergedMetadataForFolder(
  folder: string,
  supabaseServiceRole: SupabaseClient,
): Promise<Record<string, unknown>> {
  const parts = folder.split("/").filter(Boolean);
  const hierarchy = parts.map((_, i) => "/" + parts.slice(0, i + 1).join("/"));
  if (hierarchy.length === 0) return {};

  const { data, error } = await supabaseServiceRole
    .from("dropbox_assets")
    .select("dropbox_folder, metadata")
    .eq("name", "metadata.json")
    .in("dropbox_folder", hierarchy);

  if (error) {
    throw new Error(`metadata lookup for ${folder}: ${describeError(error)}`);
  }

  const merged: Record<string, unknown> = {};
  for (const row of (data ?? []).sort(
    (a, b) => (a.dropbox_folder?.length ?? 0) - (b.dropbox_folder?.length ?? 0),
  )) {
    Object.assign(merged, (row.metadata ?? {}) as Record<string, unknown>);
  }
  return merged;
}

/**
 * Folders that are rooms (their own metadata.json sets exhibition_id),
 * mapped to the room and its inherited place. Throws on a database error.
 */
async function roomsForFolders(
  folders: string[],
  supabaseServiceRole: SupabaseClient,
): Promise<Map<string, { exhibitionId: string; placeId: string }>> {
  const out = new Map<string, { exhibitionId: string; placeId: string }>();
  const unique = [...new Set(folders.filter(Boolean))];
  for (const batch of batches(unique, PATH_BATCH)) {
    const { data, error } = await supabaseServiceRole
      .from("dropbox_assets")
      .select("dropbox_folder, metadata")
      .eq("name", "metadata.json")
      .in("dropbox_folder", batch);
    if (error) throw new Error(`room folder lookup: ${describeError(error)}`);
    for (const row of data ?? []) {
      const exhibitionId = roomIdFromMetadata(row.metadata);
      if (!exhibitionId || !row.dropbox_folder) continue;
      const inherited = await mergedMetadataForFolder(row.dropbox_folder, supabaseServiceRole);
      const placeId = stringOrNull(inherited.place_id);
      if (placeId) out.set(row.dropbox_folder, { exhibitionId, placeId });
    }
  }
  return out;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
