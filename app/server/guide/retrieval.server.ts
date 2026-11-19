import {
  Pinecone,
  type RecordMetadata,
  type ScoredPineconeRecord,
} from "@pinecone-database/pinecone";
import { getQueryEmbedding } from "~/utils/pinecone";
import type { LocationContext } from "./location.server";

// Retrieval for the guide webhook.
//
//   1. SEARCH:  three searches over both namespaces, run in parallel:
//               - general:   everything in the "here" pool
//               - visual:    only `chunk_type = visual_description` in the
//                 "here" pool, with its own slots so appearance-based
//                 questions ("the big skeleton with curved tusks") always
//                 reach the reranker
//               - elsewhere: other exhibitions at the same place
//   2. RERANK:  every candidate scored against the search query together
//   3. GATE:    keep chunks that clear RERANK_MIN; up to FINAL_N from
//               "here" and up to ELSEWHERE_N from "elsewhere", each pool
//               with its own slots so one can't crowd out the other
//
// Pools:
// - here: this exhibition, plus place-level content that isn't tied to any
//   exhibition (e.g. place:amnh-nyc:identity).
// - elsewhere: other exhibitions in the same place (other AMNH halls), only
//   content shareable within the venue. The prompt always names their hall.
// Other venues are excluded. Later pools (background, elsewhere outside)
// will be added the same way.

type Match = ScoredPineconeRecord<RecordMetadata>;

export type RetrievalPool = "here" | "elsewhere";
export type RetrievalSearch = "general" | "visual" | "elsewhere";

export type RetrievedChunk = {
  id: string;
  namespace: Namespace;
  pool: RetrievalPool;
  /** Which searches returned this chunk (a chunk can be found by both). */
  searches: RetrievalSearch[];
  dense: number;
  /** null when the reranker failed. */
  rerank: number | null;
  /** Selection pass that picked this chunk (see selectChunks); null if not selected. */
  pass: 1 | 2 | null;
  metadata: RecordMetadata;
};

export type RetrievalResult = {
  /** Chunks for the answering model, best first. May be empty. */
  chunks: RetrievedChunk[];
  /** Every candidate that went to the reranker, with scores, for logging. */
  candidates: RetrievedChunk[];
  filter: Record<string, any>;
  /** null when the visitor isn't in an exhibition (no "elsewhere" pool). */
  elsewhereFilter: Record<string, any> | null;
  counts: {
    general_raw: number;
    visual_raw: number;
    elsewhere_raw: number;
    candidates: number;
    final: number;
  };
  rerankFailed: boolean;
  rerankError: string | null;
  timings: { embed_ms: number; search_ms: number; rerank_ms: number };
};

const INDEX = "wonderway";
const NAMESPACES = ["contextual", "global"] as const;
type Namespace = (typeof NAMESPACES)[number];

/**
 * Minimum dense (embedding similarity) score for a chunk to be considered
 * for reranking. Deliberately low: this is a RECALL gate, not a relevance
 * gate. The reranker makes the real relevance decision.
 *
 * 0.30 because the AMNH eval had correct chunks at dense 0.39 to 0.46 (e.g.
 * the Ross MacPhee interview chunks), which a higher floor would have
 * dropped before the reranker saw them.
 */
export const DENSE_FLOOR = 0.3;

/**
 * Minimum rerank score for a chunk to reach the model. The main relevance
 * threshold of the pipeline.
 *
 * 0.30 from a 24-case AMNH eval: clean no-answer cases topped out at about
 * 0.05, and the weakest legitimate hit scored about 0.35. Related-topic chunks
 * that don't answer the question (0.2 to 0.6) can't be separated by any
 * threshold; the answer prompt handles those. Override with the RERANK_MIN
 * env var. Recalibrate if RERANK_MODEL or the corpus changes.
 */
export const RERANK_MIN = Number(process.env.RERANK_MIN ?? 0.3);

/** Candidates per namespace for the general search. */
const GENERAL_TOP_K = 8;

/** Candidates per namespace for the visual-description search. */
const VISUAL_TOP_K = 4;

/** Candidates per namespace for the elsewhere-in-this-venue search. */
const ELSEWHERE_TOP_K = 4;

/** Max "here" chunks passed to the answering model. */
const FINAL_N = 5;

/** Max "elsewhere" chunks passed to the answering model, on top of FINAL_N. */
const ELSEWHERE_N = 2;

/** Dense floor used ONLY when the reranker fails (stricter than DENSE_FLOOR). */
const FALLBACK_DENSE_FLOOR = 0.5;

/** Must match the model RERANK_MIN was calibrated with (see rag.retrieve.ts). */
const RERANK_MODEL = "bge-reranker-v2-m3";

/** Max characters of each chunk sent to the reranker. */
const RERANK_MAX_CHARS = 2500;

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

/**
 * "Here" scope: this exhibition, or place-level content with no exhibition.
 * Without an exhibition (visitor is at the place level), the whole place.
 */
export function buildHereFilter(
  location: LocationContext,
): Record<string, any> {
  if (location.exhibitionId) {
    return {
      $or: [
        { exhibition_id: { $eq: location.exhibitionId } },
        {
          $and: [
            { place_id: { $eq: location.placeId } },
            { exhibition_id: { $exists: false } },
          ],
        },
      ],
    };
  }
  return { place_id: { $eq: location.placeId } };
}

/**
 * "Elsewhere" pool: other exhibitions at the same place, limited to content
 * shareable within the venue: `share` venue/public, or no `share` with a
 * scope whose default is shareable (object -> venue, universal -> public).
 * venue-scoped content (another hall's own framing) stays in its hall.
 * Null when the visitor isn't in an exhibition: "here" already covers the
 * whole place.
 */
export function buildElsewhereFilter(
  location: LocationContext,
): Record<string, any> | null {
  if (!location.exhibitionId) return null;
  return {
    $and: [
      { place_id: { $eq: location.placeId } },
      { exhibition_id: { $exists: true } },
      { exhibition_id: { $ne: location.exhibitionId } },
      {
        $or: [
          { share: { $in: ["venue", "public"] } },
          {
            $and: [
              { share: { $exists: false } },
              { scope: { $in: ["object", "universal"] } },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Throws if embedding or the Pinecone searches fail: without retrieval the
 * answer would silently drop to general knowledge for venue questions.
 * A reranker failure does NOT throw; it falls back to dense scores.
 */
export async function retrieveChunks(opts: {
  searchQuery: string;
  location: LocationContext;
}): Promise<RetrievalResult> {
  const index = pc.index(INDEX);
  const filter = buildHereFilter(opts.location);
  const elsewhereFilter = buildElsewhereFilter(opts.location);
  const visualFilter = {
    $and: [filter, { chunk_type: { $eq: "visual_description" } }],
  };

  // 1. embed
  const embedStart = Date.now();
  const vector = await getQueryEmbedding(opts.searchQuery);
  const embed_ms = Date.now() - embedStart;

  // 2. search: general + visual, both namespaces, in parallel
  const searchStart = Date.now();
  const query = (ns: Namespace, topK: number, f: Record<string, any>) =>
    index
      .namespace(ns)
      .query({ vector, topK, includeMetadata: true, filter: f })
      .then((res) => res.matches.map((m) => ({ ns, m })));

  const [general, visual, elsewhere] = await Promise.all([
    Promise.all(NAMESPACES.map((ns) => query(ns, GENERAL_TOP_K, filter))).then(
      (r) => r.flat(),
    ),
    Promise.all(
      NAMESPACES.map((ns) => query(ns, VISUAL_TOP_K, visualFilter)),
    ).then((r) => r.flat()),
    elsewhereFilter
      ? Promise.all(
          NAMESPACES.map((ns) => query(ns, ELSEWHERE_TOP_K, elsewhereFilter)),
        ).then((r) => r.flat())
      : Promise.resolve([]),
  ]);
  const search_ms = Date.now() - searchStart;

  // merge, dedupe (a chunk can be found by both searches), apply recall floor
  const byId = new Map<string, RetrievedChunk>();
  const add = (
    search: RetrievalSearch,
    ns: Namespace,
    m: Match,
    pool: RetrievalPool = "here",
  ) => {
    const existing = byId.get(m.id);
    if (existing) {
      if (!existing.searches.includes(search)) existing.searches.push(search);
      return;
    }
    byId.set(m.id, {
      id: m.id,
      namespace: ns,
      pool,
      searches: [search],
      dense: m.score ?? 0,
      rerank: null,
      pass: null,
      metadata: m.metadata ?? {},
    });
  };
  general.forEach(({ ns, m }) => add("general", ns, m));
  visual.forEach(({ ns, m }) => add("visual", ns, m));
  // the filters are disjoint, so an elsewhere chunk is never also "here"
  elsewhere.forEach(({ ns, m }) => add("elsewhere", ns, m, "elsewhere"));

  const candidates = [...byId.values()].filter(
    (c) => c.dense >= DENSE_FLOOR && typeof c.metadata.text === "string",
  );

  const counts = {
    general_raw: general.length,
    visual_raw: visual.length,
    elsewhere_raw: elsewhere.length,
    candidates: candidates.length,
    final: 0,
  };

  if (candidates.length === 0) {
    return {
      chunks: [],
      candidates,
      filter,
      elsewhereFilter,
      counts,
      rerankFailed: false,
      rerankError: null,
      timings: { embed_ms, search_ms, rerank_ms: 0 },
    };
  }

  // 3. rerank every candidate (all scores are kept for calibration logs)
  const rerankStart = Date.now();
  try {
    const ranked = await pc.inference.rerank(
      RERANK_MODEL,
      opts.searchQuery,
      candidates.map((c) => ({ id: c.id, text: rerankText(c.metadata) })),
      {
        topN: candidates.length,
        returnDocuments: false,
        parameters: { truncate: "END" },
      },
    );
    for (const r of ranked.data) candidates[r.index].rerank = r.score;
    candidates.sort((a, b) => (b.rerank ?? 0) - (a.rerank ?? 0));

    // 4. gate, then pick with one-per-object first, each pool separately
    const chunks = selectPools(
      candidates.filter((c) => (c.rerank ?? 0) >= RERANK_MIN),
    );

    return {
      chunks,
      candidates,
      filter,
      elsewhereFilter,
      counts: { ...counts, final: chunks.length },
      rerankFailed: false,
      rerankError: null,
      timings: { embed_ms, search_ms, rerank_ms: Date.now() - rerankStart },
    };
  } catch (err) {
    // Degraded mode: reranker unavailable. Use a stricter dense-only floor.
    console.error("[guide] rerank failed, falling back to dense floor", err);
    candidates.sort((a, b) => b.dense - a.dense);
    const chunks = selectPools(
      candidates.filter((c) => c.dense >= FALLBACK_DENSE_FLOOR),
    );

    return {
      chunks,
      candidates,
      filter,
      elsewhereFilter,
      counts: { ...counts, final: chunks.length },
      rerankFailed: true,
      rerankError: err instanceof Error ? err.message : String(err),
      timings: { embed_ms, search_ms, rerank_ms: Date.now() - rerankStart },
    };
  }
}

/** Selects each pool within its own limit; result stays in score order. */
function selectPools(sorted: RetrievedChunk[]): RetrievedChunk[] {
  const picked = new Set([
    ...selectChunks(
      sorted.filter((c) => c.pool === "here"),
      FINAL_N,
    ),
    ...selectChunks(
      sorted.filter((c) => c.pool === "elsewhere"),
      ELSEWHERE_N,
    ),
  ]);
  return sorted.filter((c) => picked.has(c));
}

/**
 * Picks up to `limit` chunks from candidates already gated and sorted best
 * first:
 *   pass 1: the best chunk from each object, so several photos of the same
 *           skeleton can't crowd out other objects (or the comparison panel)
 *   pass 2: fill the remaining slots by score from any object, so a question
 *           about ONE object (e.g. several interview sections) loses nothing
 * Chunks with no object_id count as their own object.
 */
function selectChunks(
  sorted: RetrievedChunk[],
  limit: number,
): RetrievedChunk[] {
  const picked: RetrievedChunk[] = [];
  const seenObjects = new Set<string>();

  for (const c of sorted) {
    if (picked.length >= limit) break;
    const objectKey = String(c.metadata.object_id ?? c.id);
    if (seenObjects.has(objectKey)) continue;
    seenObjects.add(objectKey);
    c.pass = 1;
    picked.push(c);
  }

  for (const c of sorted) {
    if (picked.length >= limit) break;
    if (c.pass) continue;
    c.pass = 2;
    picked.push(c);
  }

  // keep the model's context ordered by score
  return picked.sort((a, b) => sorted.indexOf(a) - sorted.indexOf(b));
}

/**
 * Text sent to the reranker: hall name, title and description first, so it
 * sees the same identifying context as the answering model ("…in the Hall
 * of Human Origins" can match the right hall's content).
 */
function rerankText(md: RecordMetadata): string {
  const head = [
    md.exhibition_name,
    md.title ?? md.name,
    md.description ?? md.subject,
  ]
    .filter(Boolean)
    .join(" — ");
  return `${head ? head + "\n" : ""}${String(md.text)}`.slice(
    0,
    RERANK_MAX_CHARS,
  );
}
