// ~/server/agent/rag.retrieve.ts
//
// Retrieval pipeline for the agent webhook:
//
//   1. RECALL:  query Pinecone (contextual + global namespaces) with a low
//               similarity floor so relevant chunks aren't discarded early.
//   2. RERANK:  score every surviving candidate against the rewritten query
//               with a cross-encoder reranker, which judges relevance far
//               better than embedding similarity alone.
//   3. GATE:    keep only the top N chunks whose rerank score clears
//               RERANK_MIN. If none do, return no matches, which makes the
//               webhook inject `noRagFallbackMessage` (the "I don't have
//               enough verified information" path).
//
// Why not just a higher dense score floor? In the AMNH session logs, relevant
// and irrelevant chunks had overlapping dense scores (a correct chunk at
// 0.518, irrelevant junk up to 0.604), so no single dense threshold separates
// them. The reranker does.
//
// Calibration harness: the temporary /api/eval-retrieval route. Delete it
// once thresholds are settled.

import type {
  Pinecone,
  RecordMetadata,
  ScoredPineconeRecord,
} from "@pinecone-database/pinecone";

type Match = ScoredPineconeRecord<RecordMetadata>;

/**
 * Minimum dense (embedding similarity) score for a chunk to even be
 * considered for reranking. Deliberately low: this is a RECALL gate, not a
 * relevance gate. The reranker makes the real relevance decision.
 *
 * Lowered from 0.45 to 0.30 after the eval showed correct chunks with dense
 * scores of 0.39 to 0.46 (e.g. the Ross MacPhee interview chunks), which a
 * higher floor would have dropped before the reranker ever saw them.
 */
export const DENSE_FLOOR = 0.3;

/**
 * Minimum rerank score for a chunk to reach the model.
 * This is the main relevance threshold of the pipeline.
 *
 * 0.30 chosen from a 24-case eval: clean no-answer cases topped out at about
 * 0.05, and the weakest legitimate hit scored about 0.35. Related-topic chunks
 * that don't actually answer the question (0.2 to 0.6) can't be separated by
 * any threshold; the "use only chunks that directly address the question"
 * prompt rule handles those. Override with the RERANK_MIN env var. Recalibrate
 * if the reranker model or the corpus changes.
 */
export const RERANK_MIN = Number(process.env.RERANK_MIN ?? 0.3);

/** Maximum number of chunks passed to the answering model. */
const FINAL_N = 5;

/**
 * Dense-score floor used ONLY when the reranker call fails. Without a
 * reranker we have nothing but embedding similarity to judge relevance, so
 * this is stricter than DENSE_FLOOR to limit junk reaching the model.
 */
const FALLBACK_DENSE_FLOOR = 0.5;

/** Pinecone Inference reranker model. Changing it requires recalibrating RERANK_MIN. */
const RERANK_MODEL = "bge-reranker-v2-m3";

/**
 * Max characters of each chunk sent to the reranker (bounds cost and latency).
 * The model has a 1024-token limit per query+document pair; `truncate: "END"`
 * below prevents an oversized chunk from failing the whole request, and this
 * cap keeps most chunks under the limit so less text is cut.
 */
const RERANK_MAX_CHARS = 2500;

/**
 * Shape of a raw (pre-rerank, pre-floor) match as logged in the
 * `agent_webhook_rag` event. Kept identical to the shape the webhook logged
 * before this module existed, so existing SQL keeps working.
 */
const toRaw = (m: Match) => ({
  score: m.score,
  id: m.id,
  object_id: m.metadata?.object_id,
  exhibition_id: m.metadata?.exhibition_id,
  place_id: m.metadata?.place_id,
  chunk_type: m.metadata?.chunk_type,
  source_name: m.metadata?.source_name,
  text: m.metadata?.text,
});

/**
 * Text sent to the reranker for a chunk. Prepends the title and description
 * so the reranker sees the same identifying context the answering model gets
 * (e.g. the globe's chunk text is Laurentide prose, and "large globe" only
 * appears in its description).
 */
const rerankText = (m: Match): string => {
  const md = m.metadata ?? {};
  const head = [md.title ?? md.name, md.description ?? md.subject]
    .filter(Boolean)
    .join(" — ");
  return `${head ? head + "\n" : ""}${String(md.text)}`.slice(
    0,
    RERANK_MAX_CHARS,
  );
};

/** Returned in place of a Pinecone response when a namespace is disabled. */
const EMPTY_RESULT = { matches: [] as Match[] };

/**
 * Retrieve the most relevant chunks for a visitor's question.
 *
 * @param opts.pc           Initialized Pinecone client.
 * @param opts.embedding    Embedding of `searchQuery` (NOT the raw visitor
 *                          query), so it must be computed from the rewrite.
 * @param opts.searchQuery  Rewritten, English, instruction-free query. Used
 *                          as the reranker's query.
 * @param opts.filter       Metadata filter for the CONTEXTUAL namespace only
 *                          (place/exhibition scope, optional proximity).
 * @param opts.ctxTopK      Chunks to fetch from the contextual namespace.
 *                          Pass 0 to skip that namespace (Pinecone rejects topK 0).
 * @param opts.globalTopK   Chunks to fetch from the global namespace.
 *                          Pass 0 to skip that namespace.
 * @param opts.topN         How many reranked chunks to return in `rerank`
 *                          diagnostics (default FINAL_N). Used by the eval to
 *                          see every candidate's score. Never changes how many
 *                          chunks reach the model: that is always <= FINAL_N.
 *
 * @returns
 *   - matches:      final chunks to give the model (may be empty).
 *   - candidates:   number of chunks that survived the dense floor (for logging).
 *   - rerank:       per-candidate dense and rerank scores, for logging and
 *                   threshold calibration. Empty if there were no candidates
 *                   or the reranker failed.
 *   - raw:          every chunk Pinecone returned, before any floor or rerank,
 *                   for the `agent_webhook_rag` event.
 *   - rerankFailed: true if the reranker threw and the dense-only fallback
 *                   was used. Log this so degraded mode is queryable.
 *   - rerankError:  the reranker's error message when it failed, else null.
 */
export async function retrieve(opts: {
  pc: Pinecone;
  embedding: number[];
  searchQuery: string;
  filter?: Record<string, any>;
  ctxTopK: number;
  globalTopK: number;
  topN?: number;
}) {
  const index = opts.pc.index("wonderway");

  // ---------------------------------------------------------------------
  // 1. RECALL: query both namespaces in parallel.
  //    A topK of 0 means "this query type doesn't use that namespace".
  // ---------------------------------------------------------------------
  const [ctx, glob] = await Promise.all([
    // Contextual namespace: venue-specific content, scoped by the filter.
    opts.ctxTopK > 0
      ? index.namespace("contextual").query({
          vector: opts.embedding,
          topK: opts.ctxTopK,
          includeMetadata: true,
          ...(opts.filter && { filter: opts.filter }),
        })
      : Promise.resolve(EMPTY_RESULT),
    // Global namespace: general reference content.
    // NOTE: intentionally unfiltered for now, so it can return content from
    // other venues (and other halls). The reranker mostly suppresses it, but
    // add a venue filter once global metadata is consistent.
    opts.globalTopK > 0
      ? index.namespace("global").query({
          vector: opts.embedding,
          topK: opts.globalTopK,
          includeMetadata: true,
        })
      : Promise.resolve(EMPTY_RESULT),
  ]);

  // Everything Pinecone returned, untouched by floors or reranking.
  const raw = {
    contextual: ctx.matches.map(toRaw),
    global: glob.matches.map(toRaw),
  };

  // Merge both result sets, then drop:
  //   - duplicates (the same chunk id can appear in both namespaces),
  //   - chunks below the recall floor,
  //   - chunks with no `text` metadata (the reranker needs text, and the
  //     answering model has nothing to read without it).
  const seen = new Set<string>();
  const candidates = [...ctx.matches, ...glob.matches].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return (
      (m.score ?? 0) >= DENSE_FLOOR && typeof m.metadata?.text === "string"
    );
  });

  // Nothing to rerank. The caller will treat this as "no context found".
  if (candidates.length === 0) {
    return {
      matches: [] as Match[],
      candidates: 0,
      rerank: [] as any[],
      raw,
      rerankFailed: false,
      rerankError: null as string | null,
    };
  }

  try {
    // -------------------------------------------------------------------
    // 2. RERANK: score each candidate's text against the rewritten query.
    // -------------------------------------------------------------------
    // Check the call signature against your installed
    // @pinecone-database/pinecone version.
    const ranked = await opts.pc.inference.rerank(
      RERANK_MODEL,
      opts.searchQuery,
      candidates.map((m) => ({
        id: m.id,
        text: rerankText(m),
      })),
      // Results come back sorted by rerank score, best first.
      {
        // Never ask for more results than there are candidates.
        topN: Math.min(opts.topN ?? FINAL_N, candidates.length),
        returnDocuments: false,
        parameters: { truncate: "END" },
      },
    );

    // Diagnostics for logging and calibration. `r.index` points back into
    // `candidates`, so we can pair each rerank score with its dense score.
    const rerank = ranked.data.map((r) => ({
      id: candidates[r.index].id,
      object_id: candidates[r.index].metadata?.object_id,
      dense: candidates[r.index].score,
      rerank: r.score,
    }));

    // -------------------------------------------------------------------
    // 3. GATE: keep only chunks that clear the rerank threshold.
    // -------------------------------------------------------------------
    const matches = ranked.data
      .filter((r) => r.score >= RERANK_MIN)
      .slice(0, FINAL_N) // never send more than FINAL_N to the model
      .map((r) => candidates[r.index]);

    return {
      matches,
      candidates: candidates.length,
      rerank,
      raw,
      rerankFailed: false,
      rerankError: null as string | null,
    };
  } catch (err) {
    // -------------------------------------------------------------------
    // Degraded mode: the reranker is unavailable (outage, rate limit, bad
    // input). Fall back to a stricter dense-only floor so the agent keeps
    // working with somewhat lower quality instead of failing.
    // `rerankFailed: true` and `rerankError` are returned so the webhook
    // can log it.
    // -------------------------------------------------------------------
    console.error("rerank failed, falling back to dense floor:", err);
    const rerankError = err instanceof Error ? err.message : String(err);
    const matches = candidates
      .filter((m) => (m.score ?? 0) >= FALLBACK_DENSE_FLOOR)
      // candidates is contextual-then-global, so sort to keep the best five
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, FINAL_N);
    return {
      matches,
      candidates: candidates.length,
      rerank: [] as any[],
      raw,
      rerankFailed: true,
      rerankError,
    };
  }
}
