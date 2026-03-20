import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});
const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });

export const PINECONE_SCORE = 0.62;

export async function queryPinecone(
  query: string,
  _index: string,
  _namespace: string,
): Promise<{
  context: string;
  avgScore: number;
}> {
  console.log("query: ", query);
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
    console.log(`🧠 Match ${i + 1}`);
    console.log("Score:", m.score);
    console.log("Text:", m.metadata?.text);
    console.log("Metadata:", m.metadata);
    console.log("-----");
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

  console.log("rag results: ", context);
  console.log("rag score: ", avgScore);

  return { context, avgScore };
}

/*
export async function debugPinecone() {
  const indexes = await pc.listIndexes();
  console.log("✅ Available indexes:", indexes);

  const index = pc.index(process.env.PINECONE_INDEX!);
  const stats = await index.describeIndexStats();
  console.log("✅ Index stats:", JSON.stringify(stats, null, 2));
}*/
