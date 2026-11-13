import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});
const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });

export const PINECONE_SCORE = 0.6;

const PINECONE_NAMESPACES = ["global", "contextual", "__default__"];

export async function getQueryEmbedding(query: string): Promise<number[]> {
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: query,
  });

  return embeddingResponse.data[0].embedding;
}

export async function queryPinecone(
  query: string,
  _index: string,
  _namespace: string,
): Promise<{
  context: string;
  avgScore: number;
}> {
  // 1️⃣ Create high-quality embedding for the query
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: query,
  });

  const queryEmbedding = embeddingResponse.data[0].embedding;

  // 2️⃣ Query Pinecone
  const index = pc.index(_index);

  const results = await index.namespace(_namespace).query({
    vector: queryEmbedding,
    topK: 5,
    includeMetadata: true,
  });

  if (!results.matches?.length) return { context: "", avgScore: 0 };

  results.matches.forEach((m, i) => {
    /*
    console.log(`🧠 Match ${i + 1}`);
    console.log("Score:", m.score);
    console.log("Text:", m.metadata?.text);
    console.log("Metadata:", m.metadata);
    console.log("-----");
    */
  });

  // 3️⃣ Filter & assemble results
  const filtered = results.matches.filter(
    (m) => m.score && m.score > PINECONE_SCORE,
  );
  const avgScore =
    filtered.reduce((sum, m) => sum + (m.score || 0), 0) /
    (filtered.length || 1);

  const context = filtered
    .map((m) => m.metadata?.text || "")
    .join("\n\n---\n\n");

  // console.log("rag results: ", context);
  // console.log("rag score: ", avgScore);

  return { context, avgScore };
}

/**
 * Delete all records with a matching key/value metadata pair.
 * @param _index
 * @param key
 * @param value
 */
export async function deleteByMetadata(
  _index: string,
  key: string,
  value: string,
) {
  const index = pc.index(_index);
  const stats = await index.describeIndexStats();
  const namespaces = Object.keys(stats.namespaces ?? {});

  for (const namespace of namespaces) {
    const results = await index.namespace(namespace).query({
      vector: new Array(3072).fill(0), // text-embedding-3-large dimension
      topK: 10000,
      includeMetadata: true,
      filter: { [key]: { $eq: value } },
    });

    const ids = results.matches.map((m) => m.id);
    if (ids.length > 0) {
      await index.namespace(namespace).deleteMany(ids);
      console.log(
        `Deleted ${ids.length} records from namespace "${namespace}" where ${key}=${value}`,
      );
    }
  }
}

/**
 * Delete one or more records by ID, regardless of which namespace
 * they're in. Since Pinecone requires a namespace to delete by ID,
 * this checks every namespace in the index and deletes matching IDs
 * from wherever they're actually found.
 * @param _index
 * @param ids one or more vector IDs to delete
 */
export async function deleteByIds(
  _index: string,
  ids: string | string[],
): Promise<number> {
  const idList = [...new Set(Array.isArray(ids) ? ids : [ids])].filter(Boolean);

  if (idList.length === 0) return 0;

  const index = pc.index(_index);

  await Promise.all(
    PINECONE_NAMESPACES.map(async (namespace) => {
      try {
        await index.namespace(namespace).deleteMany(idList);
      } catch (err) {
        // Pinecone 404s when the namespace doesn't exist in this index
        // (e.g. wonderway-about has only __default__): nothing to delete
        if (err instanceof Error && err.name === "PineconeNotFoundError") return;
        throw err;
      }

      console.log(
        `Requested deletion of ${idList.length} record(s) from namespace "${namespace}"`,
      );
    }),
  );

  return idList.length;
}

/**
 * Indexes the Dropbox ingest writes to (a folder's metadata.json picks one
 * with `"index"`; unset = DEFAULT_INGEST_INDEX).
 */
export const DEFAULT_INGEST_INDEX = "wonderway";
export const INGEST_INDEXES = [DEFAULT_INGEST_INDEX, "wonderway-about"] as const;

/**
 * Delete Dropbox-ingested vectors by id from every ingest index.
 * dropbox_assets doesn't record which index a file went to (and a folder's
 * index can change), so try them all. Ids are per Dropbox file, so this
 * can't touch another file's vectors.
 */
export async function deleteFromIngestIndexes(ids: string[]) {
  await Promise.all(INGEST_INDEXES.map((name) => deleteByIds(name, ids)));
}

/**
 * Upsert a chunk of text into the rag
 * @param text
 * @param metadata
 * @param _index
 * @param _namespace
 */
export async function upsertChunk(
  text: string,
  metadata: Record<string, string>,
  _index: string = "wonderway",
  _namespace: string = "global",
) {
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: text,
  });

  const vector = embeddingResponse.data[0].embedding;
  const id = crypto.randomUUID();

  const index = pc.index(_index);
  await index.namespace(_namespace).upsert([
    {
      id,
      values: vector,
      // `language` (ISO 639-1) defaults to English unless the caller sets it
      metadata: { language: "en", ...metadata, text },
    },
  ]);

  console.log(`Upserted chunk to ${_index}/${_namespace}:`, id);
}

/*
export async function debugPinecone() {
  const indexes = await pc.listIndexes();
  console.log("✅ Available indexes:", indexes);

  const index = pc.index(process.env.PINECONE_INDEX!);
  const stats = await index.describeIndexStats();
  console.log("✅ Index stats:", JSON.stringify(stats, null, 2));
}*/
