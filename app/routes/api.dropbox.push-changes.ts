/*
 *  This route pushes changes made in Dropbox into the RAG
 *  It is the second half of the flow that starts with the /api/dropbox.ingest route, which gathers changes from Dropbox and stores them in the database.
 *  The flow:
 *    - n8n workflow "WW Prod - Check for changed Dropbox files" runs on a schedule and calls /api/dropbox.ingest
 *    - /api/dropbox.ingest gathers changes from Dropbox and stores them in the database
 *    - /api/dropbox.push-changes is called to process those changes and push them into the RAG
 */
import { Pinecone } from "@pinecone-database/pinecone";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Dropbox } from "dropbox";
import exifr from "exifr";
import mammoth from "mammoth";
import OpenAI from "openai";
import { ActionFunctionArgs } from "react-router";
import type { Database } from "~/types/supabase";
import { deleteByIds } from "~/utils/pinecone";
import { describeImage, ocrImage } from "~/utils/ragIngest/vision.server";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const pineconeIndex = pinecone.index("wonderway");

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "docx"]);

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (request.headers.get("x-api-key") !== "wonderway-2026") {
    return new Response("Unauthorized", { status: 401 });
  }

  const runStart = Date.now();

  try {
    const { supabase } = getSupabaseServiceRoleClient();
    const { data: queued, error: fetchError } = await supabase
      .from("dropbox_assets")
      .select("*")
      .eq("status", "process")
      .neq("name", "metadata.json")
      .not("dropbox_file_id", "is", null)
      .not("name", "is", null)
      .order("id", { ascending: true })
      .limit(FETCH_LIMIT);

    if (fetchError) {
      throw fetchError;
    }

    if (!queued || queued.length === 0) {
      return new Response("No files to process", { status: 200 });
    }

    /*
     * Heavy files (vision/OCR) first so every run makes progress on images,
     * then light files (text, location) to use the rest of the time.
     * Each group stays in queue (id) order.
     */
    const heavy = queued
      .filter((r) => fileCost(r) === "heavy")
      .slice(0, MAX_HEAVY);
    const light = queued
      .filter((r) => fileCost(r) === "light")
      .slice(0, MAX_LIGHT);

    const ctx: ProcessingContext = {
      supabase,
      dbx: new Dropbox({
        clientId: process.env.DROPBOX_APP_KEY,
        clientSecret: process.env.DROPBOX_APP_SECRET,
        refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
      }),
      metadataCache: new Map<string, any>(),
    };

    const results: { name: string; status: string; ms: number }[] = [];
    let deferred = 0;

    for (const [rows, worstMs] of [
      [heavy, HEAVY_WORST_MS],
      [light, LIGHT_WORST_MS],
    ] as const) {
      for (const row of rows) {
        // Only start a file if its worst case still fits under the limit.
        // Vercel kills the function at its max duration, and a killed run
        // can't record a status, so the file would block the queue.
        if (Date.now() - runStart + worstMs > SAFE_LIMIT_MS) {
          deferred++;
          continue;
        }

        const fileStart = Date.now();
        let status: string;

        // One file's failure must not stop the run or stay at the head of
        // the queue: mark it "error" and move on. It is re-queued when the
        // file changes in Dropbox, or by resetting its status.
        try {
          status = await processFile(row, ctx);
        } catch (error) {
          console.error(
            `[push-changes] failed ${row.dropbox_path}:`,
            error instanceof Error ? error.message : error,
          );
          status = "error";
        }

        try {
          await updateProcessingStatus(status, row.dropbox_file_id, supabase);
        } catch (error) {
          console.error(`[push-changes] status update failed:`, error);
        }

        results.push({
          name: row.name,
          status,
          ms: Date.now() - fileStart,
        });
      }
    }

    console.log("[push-changes] run", {
      ms: Date.now() - runStart,
      queued: queued.length,
      deferred,
      results,
    });

    return new Response(
      JSON.stringify({ processed: results.length, deferred, results }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error pushing changes to RAG:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

// ─── batching ────────────────────────────────────────────────────────────────

/** How many queued files to look at per run. */
const FETCH_LIMIT = 25;

/** Max vision/OCR files per run. */
const MAX_HEAVY = 2;

/** Max text/location files per run. */
const MAX_LIGHT = 10;

/**
 * Stop starting new files once elapsed + a file's worst case would pass this.
 * Keep it ~10s under the Vercel function max duration (currently 60s).
 */
const SAFE_LIMIT_MS = Number(process.env.PUSH_CHANGES_SAFE_LIMIT_MS ?? 50_000);

/** Vision/OCR worst case: the OpenAI call timeout (vision.server.ts) + embed + writes. */
const HEAVY_WORST_MS = 30_000;

/** Text/location worst case: download + embed + writes. */
const LIGHT_WORST_MS = 5_000;

function fileExtension(name: string | null) {
  return name?.split(".").pop()?.toLowerCase() ?? "";
}

/** Heavy = an OpenAI vision call (vision/OCR folders). Everything else is light. */
function fileCost(row: { name: string | null; dropbox_folder: string | null }) {
  const folder = row.dropbox_folder ?? "";
  const isImage = IMAGE_EXTENSIONS.has(fileExtension(row.name));
  return isImage && (folder.includes("vision") || folder.includes("ocr"))
    ? "heavy"
    : "light";
}

type DropboxAssetRow = Database["public"]["Tables"]["dropbox_assets"]["Row"];

/** Merged folder metadata; null when the folder has no metadata.json. */
type FolderMetadata = Record<string, unknown> | null;

type ProcessingFile = Omit<DropboxAssetRow, "metadata"> & {
  metadata: Record<string, unknown>;
  extension: string;
  doc_source: string;
  binary?: Buffer;
  download_link?: string;
};

type ProcessingContext = {
  supabase: SupabaseClient;
  dbx: Dropbox;
  metadataCache: Map<string, FolderMetadata>;
};

/**
 * Processes one queued file and returns its new status. Throws on failure;
 * the caller records "error".
 */
async function processFile(
  row: DropboxAssetRow,
  ctx: ProcessingContext,
): Promise<string> {
  const { supabase, dbx, metadataCache } = ctx;

  const folder = row.dropbox_folder;
  if (!folder) return "skipped";

  // Get the metadata for this file's folder
  let metadata = metadataCache.get(folder);
  if (metadata === undefined) {
    metadata = await getMetadataForFolder(folder, supabase);
    metadataCache.set(folder, metadata);
  }
  if (metadata === null) return "skipped";

  const file: ProcessingFile = {
    ...row,
    // Copy: processing sets per-file fields (e.g. chunk_type) on metadata,
    // and the cached object is shared by every file in the folder this run.
    metadata: { ...metadata },
    extension: fileExtension(row.name),
    doc_source: "dropbox",
  };

  if (TEXT_EXTENSIONS.has(file.extension)) {
    // Text files need the binary
    const response = await dbx.filesDownload({ path: file.dropbox_path! });
    file.binary = (
      response.result as unknown as { fileBinary: Buffer }
    ).fileBinary;

    return (await processTextFile(file, supabase)) ? "success" : "process";
  }

  if (!IMAGE_EXTENSIONS.has(file.extension)) return "skipped";

  if (folder.includes("location")) {
    // Location images need the binary for EXIF/GPS
    const response = await dbx.filesDownload({ path: file.dropbox_path! });
    file.binary = (
      response.result as unknown as { fileBinary: Buffer }
    ).fileBinary;

    return await processLocationImage(file, supabase);
  }

  if (folder.includes("vision") || folder.includes("ocr")) {
    // Vision/OCR only need a URL.
    // Don't download the image into the Vercel function.
    const downloadLink = await dbx.filesGetTemporaryLink({
      path: file.dropbox_path!,
    });
    file.download_link = downloadLink.result.link;

    const processed = folder.includes("vision")
      ? await processImageDescription(file, supabase)
      : await processImageOcr(file, supabase);

    return processed ? "success" : "process";
  }

  return "skipped";
}

async function updateProcessingStatus(
  status: string,
  dropbox_file_id: string,
  supabase: SupabaseClient,
) {
  const { error } = await supabase
    .from("dropbox_assets")
    .upsert(
      { status, dropbox_file_id, processed_at: new Date().toISOString() },
      { onConflict: "dropbox_file_id" },
    );
  if (error) {
    throw new Error(
      `Failed to upsert status for ${dropbox_file_id}: ${error.message}`,
    );
  }
}

async function processTextFile(file: any, supabase: SupabaseClient) {
  const text = await getTextFromFile(file);
  return await pushTextToPinecone(file, text, supabase);
}

async function processLocationImage(
  file: any,
  supabase: SupabaseClient,
): Promise<"success" | "skipped"> {
  const gps = await exifr.gps(file.binary);

  // No GPS won't fix itself on retry; "process" would block the queue.
  if (gps?.latitude == null || gps?.longitude == null) {
    console.warn(`[push-changes] no GPS in ${file.dropbox_path}, skipping`);
    return "skipped";
  }

  const object_id = file.metadata["object_id"] ?? file.dropbox_file_id;

  const baseRecord = {
    object_id,
    latitude: gps.latitude,
    longitude: gps.longitude,
    dropbox_file_id: file.dropbox_file_id,
    dropbox_path: file.dropbox_path,
    geom: `SRID=4326;POINT(${gps.longitude} ${gps.latitude})`,
    modified_at: new Date().toISOString(),
  };

  const groupIds = [
    file.metadata["exhibition_id"],
    file.metadata["place_id"],
  ].filter(Boolean);

  for (const group_id of groupIds) {
    const { error } = await supabase
      .from("content_locations")
      .upsert(
        { ...baseRecord, group_id },
        { onConflict: "group_id,object_id" },
      );
    if (error) {
      throw new Error(
        `Failed to upsert content_location for group ${group_id}, object ${object_id}: ${error.message}`,
      );
    }
  }
  return "success";
}

async function processImageDescription(file: any, supabase: SupabaseClient) {
  if (file?.download_link) {
    const type = file.metadata?.object_type
      ? file.metadata?.object_type
      : "artifact";
    const text = await describeImage(file.download_link, type, file.metadata);
    file.metadata.chunk_type = "visual_description";
    return await pushTextToPinecone(file, text, supabase);
  } else {
    return false;
  }
}

async function processImageOcr(file: any, supabase: SupabaseClient) {
  if (file?.download_link) {
    const text = await ocrImage(file.download_link);
    console.log("OCR : ", text);
    if (text === "NO_TEXT_FOUND") {
      // Nothing to index, but not a failure — don't retry forever. Clear
      // any chunks from an earlier run that did find text, so they don't
      // linger with stale metadata.
      await clearFileVectors(file, supabase);
      return true;
    }
    file.metadata.chunk_type = "ocr";
    return await pushTextToPinecone(file, text, supabase);
  } else {
    return false;
  }
}

async function getMetadataForFolder(folder: string, supabase: SupabaseClient) {
  const folderPaths = getFolderHierarchy(folder);

  const { data: metadataRecords, error: metadataError } = await supabase
    .from("dropbox_assets")
    .select("dropbox_folder, metadata")
    .eq("name", "metadata.json")
    .in("dropbox_folder", folderPaths);

  if (metadataError) {
    throw metadataError;
  }

  if (!metadataRecords || metadataRecords.length === 0) {
    return null;
  }

  metadataRecords.sort(
    (a, b) => a.dropbox_folder.length - b.dropbox_folder.length,
  );

  const merged = {};

  for (const record of metadataRecords) {
    Object.assign(merged, record.metadata ?? {});
  }
  return merged;
}

function getFolderHierarchy(folder: string): string[] {
  const parts = folder.split("/").filter(Boolean);

  return parts.map((_, index) => {
    return "/" + parts.slice(0, index + 1).join("/");
  });
}

/* takes a file with a binary and returns the text string */
async function getTextFromFile(file: any): Promise<string> {
  const extension = file.extension;

  if (extension === "docx") {
    const result = await mammoth.extractRawText({ buffer: file.binary });
    return result.value;
  }

  // txt, md, markdown are all plain text — just decode the buffer
  return file.binary.toString("utf-8");
}

const MAX_CHARS = 6000; // ~1500 tokens, safety margin under OpenAI + Pinecone limits

function splitOversized(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const pieces: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > MAX_CHARS && current.length > 0) {
      pieces.push(current.trim());
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current.trim().length > 0) pieces.push(current.trim());

  return pieces;
}

async function getEmbeddings(chunks: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: chunks,
  });
  return response.data.map((d) => d.embedding);
}

/*
 * Removes every vector previously written for this file and clears its
 * stored pinecone_ids. Used when a re-run produces nothing to index.
 */
async function clearFileVectors(file: any, supabase: SupabaseClient) {
  if (!file.pinecone_ids || file.pinecone_ids.length === 0) return;

  await deleteByIds("wonderway", file.pinecone_ids);

  const { error } = await supabase
    .from("dropbox_assets")
    .upsert(
      { dropbox_file_id: file.dropbox_file_id, pinecone_ids: [] },
      { onConflict: "dropbox_file_id" },
    );

  if (error) {
    throw new Error(
      `Failed to clear pinecone_ids for ${file.dropbox_file_id}: ${error.message}`,
    );
  }
}

/*
 * shared by image visual description processing and generic text file splitting
 */
async function pushTextToPinecone(
  file: any,
  text: string,
  supabase: SupabaseClient,
) {
  const chunks = text
    .split("---")
    .map((c) => c.trim())
    .filter(Boolean)
    .flatMap(splitOversized);
  if (chunks.length === 0) {
    // Empty file: nothing to index, but not a failure. Returning false here
    // left the file in "process" (retried every run) with its old vectors
    // still live, so clear them and mark it done.
    await clearFileVectors(file, supabase);
    return true;
  }
  // if this file's already been processed before, clean up its old
  // vectors first so a shrinking/changed chunk count doesn't leave
  // orphaned records behind under stale ids
  if (file.pinecone_ids && file.pinecone_ids.length > 0) {
    await deleteByIds("wonderway", file.pinecone_ids);
  }
  const embeddings = await getEmbeddings(chunks);

  const vectors = chunks.map((chunkText, i) => ({
    id: `${file.dropbox_file_id}_chunk_${i}`,
    values: embeddings[i],
    metadata: {
      ...file.metadata,
      text: chunkText,
      chunk_index: i,
      chunk_count: chunks.length,
      dropbox_file_id: file.dropbox_file_id,
      dropbox_path: file.dropbox_path,
      source_name: file.name,
    },
  }));

  let namespace = file.metadata?.namespace ? file.metadata.namespace : "global";

  await pineconeIndex.namespace(namespace).upsert(vectors);

  const pineconeIds = vectors.map((v) => v.id);

  const { error } = await supabase
    .from("dropbox_assets")
    .upsert(
      { dropbox_file_id: file.dropbox_file_id, pinecone_ids: pineconeIds },
      { onConflict: "dropbox_file_id" },
    );

  if (error) {
    throw new Error(
      `Failed to save pinecone_ids for ${file.dropbox_file_id}: ${error.message}`,
    );
  }

  return true;
}
