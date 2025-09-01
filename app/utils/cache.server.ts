import { getRedis } from "./redis.server";
import {
  getEmbedding,
  float32ToBuffer,
  EMBEDDING_DIM,
} from "./embeddings.server";
import { SCHEMA_FIELD_TYPE } from "redis";
import { BiQuestionMark } from "react-icons/bi";

interface SearchResult {
  documents: {
    id: string;
    value: {
      answer: string;
      question: string;
      tool?: string;
      score: number;
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
      { ON: "HASH", PREFIX: "ay:" }
    );
  } catch (e: any) {
    if (!String(e).includes("Index already exists")) throw e;
  }
}

export async function searchCache(query: string, threshold = 0.86) {
  const redis = await getRedis();
  await initIndex();

  const vec = float32ToBuffer(await getEmbedding(query));

  const raw = await redis.ft.search(
    INDEX_NAME,
    `*=>[KNN 1 @embedding $vec AS score]`,
    {
      PARAMS: { vec },
      SORTBY: "score",
      DIALECT: 2,
      RETURN: ["answer", "question", "tool", "score"],
    }
  );

  const result = raw as unknown as SearchResult;

  if (result?.documents?.length > 0) {
    const doc = result.documents[0];
    const similarity = 1 - Number(doc.value.score);
    if (similarity > threshold) {
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

export async function storeCache(
  query: string,
  answer: string,
  tool: string,
  ttlSeconds?: number
) {
  const redis = await getRedis();
  await initIndex();

  const emb = float32ToBuffer(await getEmbedding(query));
  const id = `ay:${Buffer.from(`${tool}|${query}`).toString("base64url")}`;

  await redis.hSet(id, {
    embedding: emb,
    answer,
    question: query,
    tool,
  });

  if (ttlSeconds && ttlSeconds > 0) {
    await redis.expire(id, ttlSeconds);
  }

  return id;
}
