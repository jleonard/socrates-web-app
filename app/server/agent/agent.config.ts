import { AgentConfig, AgentQueryType } from "~/types";

export const QUERY_TYPE_CONFIG: Record<AgentQueryType, AgentConfig> = {
  /**
   * CHECKED
   * factual
   * "When was this painting completed?"
   * "How tall is the Eiffel Tower?"
   * "What year did this building become a landmark?"
   */
  factual: {
    tools: ["pinecone_contextual", "pinecone_global", "wiki_fallback"],
    contextualTopK: 5,
    globalTopK: 3,
    contextualScoreThreshold: 0.65,
    globalScoreThreshold: 0.6,
    geoFiltered: true,
    nearbyRadiusMeters: 15,
    promptAddition:
      "Answer directly and concisely, in 1-2 sentences. Lead with the fact itself.",
    maxResponseTokens: 150,
  },

  /**
   * CHECKED
   * visual_id
   * "What is this bicycle wheel on a stool?"
   * "What am I looking at right now?"
   * "Whose portrait is this?"
   */
  visual_id: {
    tools: ["pinecone_contextual"],
    contextualTopK: 8,
    globalTopK: 0,
    contextualScoreThreshold: 0.5,
    globalScoreThreshold: null,
    geoFiltered: true,
    nearbyRadiusMeters: 15,
    nearbyLimit: 3,
    promptAddition:
      "The visitor is looking at something specific right now. Use the retrieved nearby items to identify it.\n" +
      "Decide using these rules:\n" +
      "1. ONE clear match: if exactly one retrieved item fits the visitor's description, identify it " +
      "confidently in 1-2 sentences.\n" +
      "2. MULTIPLE plausible matches: if two or more retrieved items fit the description equally well " +
      "(e.g. the visitor names an artist and several works by that artist are nearby), do NOT pick one. " +
      "List each candidate by title with one short distinguishing detail (medium, color, size, or position), " +
      "then ask which one they mean.\n" +
      "3. NO strong match: say so plainly rather than guessing.\n" +
      "Only list items that appear in the retrieved context. Never invent candidates or details. " +
      "If the visitor's wording contains a distinguishing detail (a color, subject, or medium), " +
      "use it to narrow the candidates before deciding between rule 1 and rule 2.",
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
    tools: ["pinecone_contextual", "pinecone_global", "wiki_fallback"],
    contextualTopK: 6,
    globalTopK: 5,
    contextualScoreThreshold: 0.6,
    globalScoreThreshold: 0.6,
    geoFiltered: true, // fallback — prefer filtering to resolved entity ids when both sides of the comparison resolve
    nearbyRadiusMeters: 15,
    promptAddition:
      "Compare and contrast the items directly. Structure the answer around 2-3 concrete points " +
      "of similarity or difference rather than describing each item separately.",
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
    tools: ["pinecone_contextual", "pinecone_global", "wiki_fallback"],
    contextualTopK: 5,
    globalTopK: 3,
    contextualScoreThreshold: 0.65,
    globalScoreThreshold: 0.6,
    geoFiltered: true,
    nearbyRadiusMeters: 20,
    promptAddition:
      "Answer in a narrative, descriptive style, grounded in what's nearby.",
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
    tools: ["pinecone_contextual", "pinecone_global", "wiki_fallback"],
    contextualTopK: 2,
    globalTopK: 8,
    contextualScoreThreshold: 0.65,
    globalScoreThreshold: 0.55,
    geoFiltered: true,
    // no nearbyRadiusMeters — always plain place/exhibition $eq, no proximity narrowing
    promptAddition:
      "Synthesize across the retrieved context into a thoughtful narrative answer about meaning, " +
      "influence, or significance. It's fine to draw connections the sources don't state explicitly, " +
      "but stay grounded in the retrieved material rather than inventing specifics.",
    maxResponseTokens: 600,
  },

  /**
   * discovery
   * "What should I see if I only have an hour?"
   * "What are the highlights here?"
   * "What's worth checking out near me?"
   */
  discovery: {
    tools: ["pinecone_contextual"],
    contextualTopK: 15,
    globalTopK: 0,
    contextualScoreThreshold: null, // filter-driven, not score-driven
    globalScoreThreshold: null,
    geoFiltered: true,
    promptAddition:
      "Present the answer as a ranked, scannable list. Give one short line of reasoning per item " +
      "explaining why it's worth seeing, ordered by how strongly it's recommended.",
    maxResponseTokens: 500,
  },

  navigational_locate: {
    tools: ["pinecone_contextual", "redis_geo"],
    contextualTopK: 1,
    globalTopK: 0,
    contextualScoreThreshold: 0.75, // institution-wide lookup — needs near-exact match or should defer, not guess
    globalScoreThreshold: null,
    geoFiltered: false, // deliberately NOT geo-scoped — they're asking because it's not nearby
    promptAddition:
      "Give the location and, if available, brief directions from the visitor's current position. " +
      "If the match confidence is low, ask a clarifying question instead of guessing.",
    maxResponseTokens: 150,
  },

  /**
   * operational
   * "What time does the Museum close?"
   * "How much are tickets?"
   * "Is this place wheelchair accessible?"
   */
  operational: {
    tools: ["redis_operational"],
    contextualTopK: 0,
    globalTopK: 0,
    contextualScoreThreshold: null,
    globalScoreThreshold: null,
    geoFiltered: false,
    promptAddition:
      "Answer directly from the operational data provided. No elaboration needed.",
    maxResponseTokens: 100,
  },
};
