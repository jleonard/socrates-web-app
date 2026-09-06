import { SCHEMA_FIELD_TYPE } from "redis";
import {
  EMBEDDING_DIM,
  float32ToBuffer,
  getEmbedding,
} from "./embeddings.server";
import { getRedis } from "./redis.server";

interface SearchResult {
  documents: {
    id: string;
    value: {
      answer: string;
      question: string;
      tool?: string;
      score: number;
      hits?: number;
    };
  }[];
}

const INDEX_NAME = "ayapi_cache";

export async function initIndex() {
  const redis = await getRedis();
  try {
    await redis.ft.create(
      INDEX_NAME,
      {
        embedding: {
          type: SCHEMA_FIELD_TYPE.VECTOR,
          ALGORITHM: "HNSW",
          TYPE: "FLOAT32",
          DIM: EMBEDDING_DIM,
          DISTANCE_METRIC: "COSINE",
        },
        answer: { type: SCHEMA_FIELD_TYPE.TEXT },
        question: { type: SCHEMA_FIELD_TYPE.TEXT },
        tool: { type: SCHEMA_FIELD_TYPE.TAG },
      },
      { ON: "HASH", PREFIX: "cache:" },
    );
  } catch (e: any) {
    if (!String(e).includes("Index already exists")) throw e;
  }
}

export async function searchCache(rawQuery: string, threshold = 0.86) {
  const redis = await getRedis();
  await initIndex();

  const query = normalizeQuery(rawQuery);
  const vec = float32ToBuffer(await getEmbedding(query));

  const raw = await redis.ft.search(
    INDEX_NAME,
    `*=>[KNN 1 @embedding $vec AS score]`,
    {
      PARAMS: { vec },
      SORTBY: "score",
      DIALECT: 2,
      RETURN: ["answer", "question", "tool", "score", "hits"],
    },
  );

  const result = raw as unknown as SearchResult;

  if (result?.documents?.length > 0) {
    const doc = result.documents[0];
    const similarity = 1 - Number(doc.value.score);
    if (similarity > threshold) {
      // ✅ Extend TTL another 90 days on every successful hit. and increment the hits on the object
      const id = doc.id;
      const ttl = 90 * 24 * 60 * 60;
      try {
        await redis.expire(id, ttl);
        await redis.hIncrBy(id, "hits", 1);
      } catch (e) {
        console.error("Failed to bump TTL for cache:", id, e);
      }
      return {
        cached: true,
        answer: doc.value.answer as string,
        question: doc.value.question as string,
        tool: doc.value.tool as string | undefined,
        similarity,
      };
    }
  }
  return null;
}

// ------------------------
// --- STORE CACHE ---
// ------------------------
export async function storeCache(
  rawQuery: string,
  answer: string,
  tool: string,
  ttlSeconds: number = 90 * 24 * 60 * 60,
) {
  const redis = await getRedis();
  await initIndex();
  const query = normalizeQuery(rawQuery);

  const emb = float32ToBuffer(await getEmbedding(query));
  const id = `cache:${Buffer.from(`${tool}|${query}`).toString("base64url")}`;

  await redis.hSet(id, {
    embedding: emb,
    answer,
    question: query,
    tool,
    hits: 0,
  });

  if (ttlSeconds && ttlSeconds > 0) {
    await redis.expire(id, ttlSeconds);
  }

  return id;
}

function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}
