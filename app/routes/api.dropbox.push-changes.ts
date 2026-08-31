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

  try {
    const { supabase } = getSupabaseServiceRoleClient();
    const { data: filesToProcess, error: fetchError } = await supabase
      .from("dropbox_assets")
      .select("*")
      .eq("status", "process")
      .neq("name", "metadata.json")
      .order("id", { ascending: false })
      .limit(2);

    if (fetchError) {
      throw fetchError;
    }

    if (!filesToProcess || filesToProcess.length === 0) {
      return new Response("No files to process", { status: 200 });
    }

    let metadataCache = new Map<string, any>();

    // Process each file
    for (const file of filesToProcess) {
      let status = file.status;
      const dbx = new Dropbox({
        clientId: process.env.DROPBOX_APP_KEY,
        clientSecret: process.env.DROPBOX_APP_SECRET,
        refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
      });

      // get the metadata for this file
      let metadata = metadataCache.get(file.dropbox_folder);
      if (metadata === undefined) {
        metadata = await getMetadataForFolder(file.dropbox_folder, supabase);
        if (metadata === null) {
          await updateProcessingStatus(
            "skipped",
            file.dropbox_file_id,
            supabase,
          );
          continue;
        }
        metadataCache.set(file.dropbox_folder, metadata);
      }
      file.metadata = metadata;

      file.extension = file.name.split(".").pop()?.toLowerCase();

      const response = await dbx.filesDownload({
        path: file.dropbox_path!,
      });

      // get download link from dropbox for the file
      const downloadLink = await dbx.filesGetTemporaryLink({
        path: file.dropbox_path!,
      });
      file.download_link = downloadLink.result.link;
      file.doc_source = "dropbox";

      file.binary = (
        response.result as unknown as { fileBinary: Buffer }
      ).fileBinary;

      if (TEXT_EXTENSIONS.has(file.extension ?? "")) {
        // send this for text processing
        let processed = await processTextFile(file, supabase);
        status = processed ? "success" : "process";
      } else if (IMAGE_EXTENSIONS.has(file.extension ?? "")) {
        if (file.dropbox_folder.includes("location")) {
          let processed = await processLocationImage(file, supabase);
          status = processed ? "success" : "process";
        } else if (file.dropbox_folder.includes("vision")) {
          let processed = await processImageDescription(file, supabase);
          status = processed ? "success" : "process";
        } else if (file.dropbox_folder.includes("ocr")) {
          let processed = await processImageOcr(file, supabase);
          status = processed ? "success" : "process";
        } else {
          status = "skipped";
        }
      } else {
        status = "skipped";
      }
      // set the status for the file
      await updateProcessingStatus(status, file.dropbox_file_id, supabase);
    }
    return new Response(JSON.stringify({ processed: filesToProcess.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error pushing changes to RAG:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

async function updateProcessingStatus(
  status: string,
  dropbox_file_id: string,
  supabase: SupabaseClient,
) {
  const { error } = await supabase
    .from("dropbox_assets")
    .upsert({ status, dropbox_file_id }, { onConflict: "dropbox_file_id" });
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

async function processLocationImage(file: any, supabase: SupabaseClient) {
  const gps = await exifr.gps(file.binary);

  if (gps?.latitude == null || gps?.longitude == null) {
    return false;
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
  return true;
}

async function processImageDescription(file: any, supabase: SupabaseClient) {
  if (file?.download_link) {
    const type = file.metadata?.object_type
      ? file.metadata?.object_type
      : "artifact";
    const text = await describeImage(file.download_link, type);
    file.metadata.chunk_type = "visual_description";
    return await pushTextToPinecone(file, text, supabase);
  } else {
    return false;
  }
}

async function processImageOcr(file: any, supabase: SupabaseClient) {
  if (file?.download_link) {
    const text = await ocrImage(file.download_link);
    if (text === "NO_TEXT_FOUND") {
      return true; // nothing to index, but not a failure — don't retry forever
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
    return false;
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
