import { SCHEMA_FIELD_TYPE } from "redis";
import {
  EMBEDDING_DIM,
  float32ToBuffer,
  getEmbedding,
} from "../embeddings.server";
import { getRedis } from "../redis.server";
import type { CacheContext, CacheDecision, CacheScope } from "./cache.types";

/**
 * Redis index used for all cached visitor Q&A.
 *
 * Cache entries are stored as Redis hashes with the `cache:` prefix.
 */
const INDEX_NAME = "wonderway_cache"; // was "ayapi_cache"
const CACHE_PREFIX = "cache:";

/**
 * Base TTL for a cache entry.
 *
 * The actual TTL is determined by `getTtlForHits()`.
 * A cache entry becomes longer-lived as visitors repeatedly
 * reuse the answer.
 */
const BASE_TTL_SECONDS = 14 * 24 * 60 * 60;

/**
 * Maximum TTL for a highly reused cache entry.
 *
 * This prevents a very popular answer from living forever.
 */
const MAX_TTL_SECONDS = 180 * 24 * 60 * 60;

/**
 * Default semantic similarity threshold.
 *
 * Redis returns cosine distance for the KNN search, so this is
 * converted to similarity with:
 *
 *     similarity = 1 - distance
 *
 * A higher threshold means we require a closer semantic match.
 */
const DEFAULT_SIMILARITY_THRESHOLD = 0.86;

interface SearchResult {
  documents: {
    id: string;
    value: {
      answer: string;
      question: string;
      location_id?: string;
      scope?: "location" | "global";
      hits?: string;
      score: number;
    };
  }[];
}

/**
 * Create the Redis search index if it doesn't already exist.
 *
 * The vector field is used for semantic question matching.
 * `location_id` and `scope` are TAG fields so Redis can efficiently
 * restrict searches to the appropriate context.
 */
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

        answer: {
          type: SCHEMA_FIELD_TYPE.TEXT,
        },

        question: {
          type: SCHEMA_FIELD_TYPE.TEXT,
        },

        location_id: {
          type: SCHEMA_FIELD_TYPE.TAG,
        },

        scope: {
          type: SCHEMA_FIELD_TYPE.TAG,
        },

        hits: {
          type: SCHEMA_FIELD_TYPE.NUMERIC,
        },
      },
      {
        ON: "HASH",
        PREFIX: CACHE_PREFIX,
      },
    );
  } catch (e: any) {
    // Redis throws when the index already exists.
    // That's expected during normal application startup.
    if (!String(e).includes("Index already exists")) {
      throw e;
    }
  }
}

// ---------------------------------------------------------
// SEARCH CACHE
// ---------------------------------------------------------

/**
 * Search for a previously cached answer that is semantically
 * similar to the visitor's question.
 *
 * Cache lookup behavior:
 *
 * 1. Look for a matching question.
 * 2. Prefer a cache entry scoped to the current location.
 * 3. Also allow global cache entries.
 * 4. Require the semantic similarity to exceed the threshold.
 * 5. When a cached answer is used:
 *      - increment its hit count
 *      - increase/refresh its TTL based on the new hit count
 *
 * Location-specific cache entries are NEVER returned for a different
 * location.
 *
 * Global cache entries can be returned from any location.
 */
export async function searchCache(
  rawQuery: string,
  context: CacheContext,
  threshold = DEFAULT_SIMILARITY_THRESHOLD,
) {
  const redis = await getRedis();
  await initIndex();

  if (!context.locationId) {
    return null;
  }

  const query = normalizeQuery(rawQuery);
  const vec = float32ToBuffer(await getEmbedding(query));

  /**
   * Search both:
   *
   *   1. entries belonging to the current location
   *   2. globally reusable entries
   *
   * Redis TAG syntax allows us to express this as:
   *
   *   location_id:{currentLocation} | scope:{global}
   */
  /*
  
  const filter = `(@location_id:{${escapeTagValue(
    context.locationId,
  )}} | @scope:{global})`;*/
  console.log(
    "locationId for cache filter:",
    JSON.stringify(context.locationId),
  );
  const filter = `(@location_id:{${escapeTagValue(context.locationId)}} | @scope:{global})`;
  console.log("filter:", filter);

  const raw = await redis.ft.search(
    INDEX_NAME,
    `${filter}=>[KNN 1 @embedding $vec AS score]`,
    {
      PARAMS: {
        vec,
      },
      SORTBY: { BY: "score", DIRECTION: "ASC" },
      DIALECT: 2,
      RETURN: ["answer", "question", "location_id", "scope", "hits", "score"],
    },
  );

  const result = raw as unknown as SearchResult;

  if (!result?.documents?.length) {
    return null;
  }

  const doc = result.documents[0];

  /**
   * Redis returns cosine distance.
   *
   * Convert it back into the more intuitive similarity score.
   */
  const similarity = 1 - Number(doc.value.score);

  if (similarity < threshold) {
    return null;
  }

  const id = doc.id;

  /**
   * A cache hit makes this answer more valuable.
   *
   * Increment the hit count first, then calculate the TTL using
   * the new hit count.
   */
  let hits = Number(doc.value.hits ?? 0) + 1;

  try {
    await redis.hIncrBy(id, "hits", 1);

    const ttl = getTtlForHits(hits);

    await redis.expire(id, ttl);
  } catch (e) {
    /**
     * A failure to update popularity/TTL should not prevent us
     * from returning an otherwise valid cached answer.
     */
    console.error("Failed to update cache hit/TTL:", id, e);
  }

  return {
    cached: true,
    answer: doc.value.answer,
    question: doc.value.question,
    similarity,
    scope: doc.value.scope as CacheScope,
    locationId: doc.value.location_id,
    hits,
  };
}

// ---------------------------------------------------------
// STORE CACHE
// ---------------------------------------------------------

/**
 * Store an agent response for potential reuse.
 *
 * The caller is responsible for deciding whether the question
 * is worth caching. This function will NOT make that decision.
 *
 * Example:
 *
 *   const decision = {
 *     cacheable: true,
 *     scope: "location"
 *   };
 *
 *   await storeCache(
 *     question,
 *     answer,
 *     {
 *       locationId,
 *     },
 *     decision
 *   );
 *
 * If `cacheable` is false, nothing is stored and the function
 * returns null.
 */
export async function storeCache(
  rawQuery: string,
  answer: string,
  context: CacheContext,
  decision: CacheDecision,
) {
  /**
   * Don't cache questions that the application has determined
   * aren't good reusable questions.
   */
  if (!decision.cacheable) {
    return null;
  }

  if (!context.locationId) {
    throw new Error("locationId is required when storing a cache entry");
  }

  const redis = await getRedis();
  await initIndex();

  const query = normalizeQuery(rawQuery);

  const embedding = float32ToBuffer(await getEmbedding(query));

  /**
   * Include the location, scope, and question in the Redis key.
   *
   * This prevents identical questions at different locations from
   * overwriting one another.
   *
   * Global entries intentionally use the same location-independent
   * key so they can be reused across locations.
   */
  const keyContext =
    decision.scope === "global" ? "global" : context.locationId;

  const id = `${CACHE_PREFIX}${Buffer.from(`${keyContext}|${query}`).toString(
    "base64url",
  )}`;

  await redis.hSet(id, {
    embedding,
    answer,
    question: query,

    /**
     * For global entries we still store the location where the
     * question originated for debugging/analytics purposes.
     *
     * The `scope` field determines whether that location restricts
     * retrieval.
     */
    location_id: context.locationId,

    scope: decision.scope,

    /**
     * New cache entries have never been reused.
     */
    hits: 0,
  });

  /**
   * New entries start with the base TTL.
   */
  await redis.expire(id, BASE_TTL_SECONDS);

  return id;
}

// ---------------------------------------------------------
// TTL / POPULARITY
// ---------------------------------------------------------

/**
 * Determine how long a cache entry should live based on how
 * often it has been reused.
 *
 * The philosophy is:
 *
 *   New answer       → short-lived
 *   Some usage       → increasingly valuable
 *   Popular answer   → long-lived
 *
 * This gives us a self-reinforcing cache where frequently useful
 * answers naturally survive longer.
 *
 * Current schedule:
 *
 *   0 hits    → 14 days
 *   1 hit     → 20 days
 *   3 hits    → 30 days
 *   10 hits   → 60 days
 *   25 hits   → 90 days
 *   50+ hits  → 180 days
 */
function getTtlForHits(hits: number): number {
  if (hits >= 50) {
    return MAX_TTL_SECONDS;
  }

  if (hits >= 25) {
    return 90 * 24 * 60 * 60;
  }

  if (hits >= 10) {
    return 60 * 24 * 60 * 60;
  }

  if (hits >= 3) {
    return 30 * 24 * 60 * 60;
  }

  if (hits >= 1) {
    return 20 * 24 * 60 * 60;
  }

  return BASE_TTL_SECONDS;
}

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

/**
 * Normalize questions before embedding/storage.
 *
 * This makes trivial formatting differences less likely to
 * produce separate cache entries.
 */
function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Escape characters that have special meaning in Redis TAG
 * expressions.
 *
 * Location IDs are normally UUIDs, but keeping this escaping here
 * makes the cache lookup safer if the ID format changes later.
 */
function escapeTagValue(value: string) {
  return value.replace(/([,.<>{}[\]"':;!@#$%^&*()\-+=~/\s|\\])/g, "\\$1");
}
