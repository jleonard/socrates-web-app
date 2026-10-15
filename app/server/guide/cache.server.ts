import { SCHEMA_FIELD_TYPE } from "redis";
import { determineCacheDecision } from "~/utils/cache/cache-decision";
import { getContentVersion } from "~/utils/cache/content.version.server";
import {
  EMBEDDING_DIM,
  float32ToBuffer,
  getEmbedding,
} from "~/utils/embeddings.server";
import { getRedis } from "~/utils/redis.server";
import type { LocationContext } from "./location.server";

// Semantic answer cache for the guide webhook.
//
// Separate from utils/cache (the old webhook's cache): that one is keyed on
// raw visitor wording, mixes languages, and holds answers from before the
// QA fixes. This one is keyed on the guide's English search query (follow-
// ups already resolved), scoped to the visitor's location, and matched only
// against the current content version (see content.version.server.ts).

/**
 * off    = no lookups, no stores
 * shadow = look up and log what WOULD be served, still generate; store new
 *          answers so the cache fills (default)
 * serve  = return hits
 */
export type GuideCacheMode = "off" | "shadow" | "serve";
export const GUIDE_CACHE_MODE: GuideCacheMode = parseMode(
  process.env.GUIDE_CACHE_MODE,
);

/**
 * Bump to retire every cached answer, e.g. after changing the answer prompt
 * or model.
 */
const GUIDE_CACHE_VERSION = 1;

/**
 * Minimum cosine similarity between search queries for a hit. Strict on
 * purpose: "how tall was the mammoth?" vs "…the mastodon?" embed very close,
 * and serving one for the other is a wrong fact. Calibrate from the logged
 * best_similarity before switching to serve.
 */
const SIMILARITY_THRESHOLD = Number(process.env.GUIDE_CACHE_THRESHOLD ?? 0.93);

const INDEX_NAME = "guide_cache";
const KEY_PREFIX = "guide_cache:";
const BASE_TTL_SECONDS = 14 * 24 * 60 * 60;

export type CacheLookup = {
  /** Set when the best match clears the threshold. */
  hit: { answer: string; question: string; similarity: number } | null;
  /** Best match regardless of threshold, for calibration logs. */
  best: { question: string; similarity: number } | null;
  version: string;
};

let indexReady = false;

async function ensureIndex() {
  if (indexReady) return;
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
        question: { type: SCHEMA_FIELD_TYPE.TEXT },
        answer: { type: SCHEMA_FIELD_TYPE.TEXT },
        location_id: { type: SCHEMA_FIELD_TYPE.TAG },
        version: { type: SCHEMA_FIELD_TYPE.TAG },
        hits: { type: SCHEMA_FIELD_TYPE.NUMERIC },
      },
      { ON: "HASH", PREFIX: KEY_PREFIX },
    );
  } catch (e) {
    if (!String(e).includes("Index already exists")) throw e;
  }
  indexReady = true;
}

/** Combined version: guide code version + this location's content versions. */
async function currentVersion(location: LocationContext) {
  const content = await getContentVersion([
    location.exhibitionId,
    location.placeId,
  ]);
  return `g${GUIDE_CACHE_VERSION}c${content}`;
}

/**
 * Looks up the best cached answer for this search query at this location
 * and content version. Never throws: on error, returns no hit.
 */
export async function lookupGuideCache(opts: {
  searchQuery: string;
  location: LocationContext;
}): Promise<CacheLookup | null> {
  try {
    await ensureIndex();
    const redis = await getRedis();
    const version = await currentVersion(opts.location);
    const vec = float32ToBuffer(
      await getEmbedding(normalize(opts.searchQuery)),
    );

    const filter = `(@location_id:{${escapeTag(opts.location.locationId)}} @version:{${escapeTag(version)}})`;
    const raw = (await redis.ft.search(
      INDEX_NAME,
      `${filter}=>[KNN 1 @embedding $vec AS score]`,
      {
        PARAMS: { vec },
        SORTBY: { BY: "score", DIRECTION: "ASC" },
        DIALECT: 2,
        RETURN: ["question", "answer", "score"],
      },
    )) as unknown as {
      documents: {
        id: string;
        value: { question: string; answer: string; score: string };
      }[];
    };

    const doc = raw?.documents?.[0];
    if (!doc) return { hit: null, best: null, version };

    const similarity = 1 - Number(doc.value.score);
    const best = { question: doc.value.question, similarity };
    const hit =
      similarity >= SIMILARITY_THRESHOLD
        ? { answer: doc.value.answer, question: doc.value.question, similarity }
        : null;

    // Only count hits that are actually served.
    if (hit && GUIDE_CACHE_MODE === "serve") {
      try {
        const hits = await redis.hIncrBy(doc.id, "hits", 1);
        await redis.expire(doc.id, ttlForHits(hits));
      } catch (err) {
        console.error("[guide] cache hit/TTL update failed", err);
      }
    }

    return { hit, best, version };
  } catch (err) {
    console.error("[guide] cache lookup failed", err);
    return null;
  }
}

/**
 * Stores an answer if it's safe to reuse. Cheap rules first, then the
 * shared cache-decision model. Never throws. Run it after the reply has
 * been sent: the decision model adds a second or two.
 */
export async function maybeStoreGuideCache(opts: {
  searchQuery: string;
  answer: string;
  location: LocationContext;
  version: string | null;
  /** grounded answers only; general-knowledge answers aren't cached */
  mode: "grounded" | "general";
  searchQueryFallback: boolean;
  rerankFailed: boolean;
}): Promise<{ stored: boolean; reason: string }> {
  const answer = opts.answer.trim();
  if (GUIDE_CACHE_MODE === "off") return { stored: false, reason: "off" };
  if (!opts.version) return { stored: false, reason: "no_version" };
  if (opts.mode !== "grounded") return { stored: false, reason: "general" };
  if (opts.searchQueryFallback)
    return { stored: false, reason: "search_query_fallback" };
  if (opts.rerankFailed) return { stored: false, reason: "rerank_failed" };
  if (!answer) return { stored: false, reason: "empty" };
  // A question back to the visitor ("which one do you mean?") isn't reusable.
  if (/[?¿]\s*$/.test(answer)) return { stored: false, reason: "asks_visitor" };

  try {
    const decision = await determineCacheDecision(opts.searchQuery, answer);
    if (!decision.cacheable) return { stored: false, reason: "decision" };

    await ensureIndex();
    const redis = await getRedis();
    const question = normalize(opts.searchQuery);
    const id = `${KEY_PREFIX}${Buffer.from(
      `${opts.location.locationId}|${opts.version}|${question}`,
    ).toString("base64url")}`;

    await redis.hSet(id, {
      embedding: float32ToBuffer(await getEmbedding(question)),
      question,
      answer,
      location_id: opts.location.locationId,
      version: opts.version,
      hits: 0,
    });
    await redis.expire(id, BASE_TTL_SECONDS);
    return { stored: true, reason: "stored" };
  } catch (err) {
    console.error("[guide] cache store failed", err);
    return { stored: false, reason: "error" };
  }
}

/** Same schedule as the old cache: popular answers live longer. */
function ttlForHits(hits: number): number {
  const day = 24 * 60 * 60;
  if (hits >= 50) return 180 * day;
  if (hits >= 25) return 90 * day;
  if (hits >= 10) return 60 * day;
  if (hits >= 3) return 30 * day;
  if (hits >= 1) return 20 * day;
  return BASE_TTL_SECONDS;
}

function normalize(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function escapeTag(value: string) {
  return value.replace(/([,.<>{}[\]"':;!@#$%^&*()\-+=~/\s|\\])/g, "\\$1");
}

function parseMode(value: string | undefined): GuideCacheMode {
  return value === "off" || value === "serve" ? value : "shadow";
}
