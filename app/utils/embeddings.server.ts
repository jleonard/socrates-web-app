/**
 * Used by routes/api.cache.ts
 */

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
export const EMBEDDING_DIM = 1536; // matches text-embedding-3-small

export async function getEmbedding(text: string): Promise<Float32Array> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return Float32Array.from(response.data[0].embedding);
}

export function float32ToBuffer(arr: Float32Array) {
  return Buffer.from(arr.buffer);
}
