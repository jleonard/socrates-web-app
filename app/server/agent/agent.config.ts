import { AgentConfig, AgentQueryType } from "~/types";

/**
 * Appended to every retrieval-backed prompt. The reranker gate (RERANK_MIN)
 * can't tell "topically related" from "actually answers the question", so
 * this rule does it. Eval cases 4271, 4284 and 4286 all had related chunks
 * that didn't answer the question.
 *
 * It also covers premise echoing (4280: "Confirm: X is a curator...").
 */
const GROUNDING_RULE =
  "\nUse only retrieved chunks that directly address the question. " +
  "If none do, say you don't have enough verified information, even if the topic seems related. " +
  "Do not confirm facts stated in the visitor's question unless the retrieved context supports them.";

/**
 * Retrieval settings shared by every type that goes through retrieve().
 * Relevance is decided by the reranker (RERANK_MIN in rag.retrieve.ts), so
 * the per-type score thresholds are gone. TopK here only sets how many
 * candidates the reranker sees. 8 and 6 are the values the eval was run with.
 */
const RETRIEVAL_DEFAULTS = {
  tools: ["pinecone_contextual", "pinecone_global"],
  contextualTopK: 8,
  globalTopK: 6,
} as const;

export const QUERY_TYPE_CONFIG: Record<AgentQueryType, AgentConfig> = {
  /**
   * CHECKED
   * factual
   * "When was this painting completed?"
   * "How tall is the Eiffel Tower?"
   * "What year did this building become a landmark?"
   */
  factual: {
    ...RETRIEVAL_DEFAULTS,
    tools: [...RETRIEVAL_DEFAULTS.tools],
    geoFiltered: true,
    nearbyRadiusMeters: 15,
    promptAddition:
      "Answer directly and concisely, in 1-2 sentences. Lead with the fact itself." +
      GROUNDING_RULE,
    maxResponseTokens: 150,
  },

  /**
   * CHECKED
   * visual_id
   * "What is this bicycle wheel on a stool?"
   * "What am I looking at right now?"
   * "Whose portrait is this?"
   *
   * Now searches the global namespace too (it was contextual-only), because
   * the reranker handles the noise that the old 0.5 floor let through.
   */
  visual_id: {
    ...RETRIEVAL_DEFAULTS,
    tools: [...RETRIEVAL_DEFAULTS.tools],
    geoFiltered: true,
    nearbyRadiusMeters: 15,
    nearbyLimit: 3,
    // NOTE: proximity filtering isn't active yet (every logged filter was the
    // plain hall scope), so these items come from the whole hall, not "nearby".
    promptAddition:
      "The visitor is looking at something specific right now. Use the retrieved items to identify it.\n" +
      "Decide using these rules:\n" +
      "1. ONE clear match: if exactly one retrieved item fits the visitor's description, identify it " +
      "confidently in 1-2 sentences.\n" +
      "2. MULTIPLE plausible matches: if two or more retrieved items fit the description equally well " +
      "(e.g. the visitor names an artist and several works by that artist are in the hall), do NOT pick one. " +
      "List each candidate by title with one short distinguishing detail (medium, color, size, or position), " +
      "then ask which one they mean.\n" +
      "3. NO strong match: say so plainly rather than guessing.\n" +
      "Only list items that appear in the retrieved context. Never invent candidates or details. " +
      "If the visitor's wording contains a distinguishing detail (a color, subject, or medium), " +
      "use it to narrow the candidates before deciding between rule 1 and rule 2." +
      GROUNDING_RULE,
    maxResponseTokens: 250,
  },

  /**
   * CHECKED
   * comparative
   * "How does this painting compare to that one?"
   * "Which of these two artists was more influential?"
   * "What's the difference between surrealism and dada?"
   */
  comparative: {
    ...RETRIEVAL_DEFAULTS,
    tools: [...RETRIEVAL_DEFAULTS.tools],
    geoFiltered: true, // fallback — prefer filtering to resolved entity ids when both sides of the comparison resolve
    nearbyRadiusMeters: 15,
    promptAddition:
      "Compare and contrast the items directly. Structure the answer around 2-3 concrete points " +
      "of similarity or difference rather than describing each item separately. " +
      "Keep it to 4 sentences or fewer." +
      GROUNDING_RULE,
    maxResponseTokens: 400,
  },

  /**
   * CHECKED
   * contextual
   * "Tell me about this room."
   * "What's the story behind this painting?"
   * "What was this building originally used for?"
   */
  contextual: {
    ...RETRIEVAL_DEFAULTS,
    tools: [...RETRIEVAL_DEFAULTS.tools],
    geoFiltered: true,
    nearbyRadiusMeters: 20,
    promptAddition:
      "Answer in a narrative, descriptive style, grounded in the retrieved context. " +
      "Keep it to 4 sentences or fewer." +
      GROUNDING_RULE,
    maxResponseTokens: 400,
  },

  /**
   * CHECKED
   * interpretive
   * "Why is this artist considered a pioneer?"
   * "What was the cultural context for this movement?"
   * "What was the artist reacting against?"
   */
  interpretive: {
    ...RETRIEVAL_DEFAULTS,
    tools: [...RETRIEVAL_DEFAULTS.tools],
    geoFiltered: true,
    // no nearbyRadiusMeters — always plain place/exhibition $eq, no proximity narrowing
    promptAddition:
      "Synthesize across the retrieved context into a clear answer about meaning, influence, or significance. " +
      "You may connect points the sources don't link explicitly, but label any such connection as an " +
      'interpretation (for example "This may suggest...") and do not state it as fact. ' +
      "Do not add specifics that aren't in the retrieved material. Keep it to 4 sentences or fewer." +
      GROUNDING_RULE,
    maxResponseTokens: 600,
  },

  /**
   * discovery
   * "What should I see if I only have an hour?"
   * "What are the highlights here?"
   * "What's worth checking out near me?"
   *
   * TODO: untested with retrieve(). The reranker scores relevance to a
   * question, not list membership, and retrieve() passes at most 5 chunks
   * above RERANK_MIN, so a "highlights" query may return too few items.
   * This type likely needs its own path that skips the rerank gate.
   */
  discovery: {
    tools: ["pinecone_contextual"],
    contextualTopK: 15,
    globalTopK: 0,
    geoFiltered: true,
    promptAddition:
      "Present the answer as a ranked, scannable list. Give one short line of reasoning per item " +
      "explaining why it's worth seeing, ordered by how strongly it's recommended. " +
      "Only list items that appear in the retrieved context.",
    maxResponseTokens: 500,
  },

  // navigational_locate ("where is X?") and operational (hours, tickets) were
  // removed until they have real handlers. Those questions are classified as
  // factual for now (see the type list in query.rewrite.server.ts).
};
