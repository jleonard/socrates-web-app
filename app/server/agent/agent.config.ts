import { AgentQueryType, AgentConfig } from "~/types";

export const QUERY_TYPE_CONFIG: Record<AgentQueryType, AgentConfig> = {
  /**
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
    highlightFiltered: false,
    promptAddition:
      "Answer directly and concisely, in 1-2 sentences. Lead with the fact itself.",
    maxResponseTokens: 150,
  },

  /**
   * visual_id
   * "What is this bicycle wheel on a stool?"
   * "What am I looking at right now?"
   * "Whose portrait is this?"
   */
  visual_id: {
    tools: ["pinecone_contextual"],
    contextualTopK: 8,
    globalTopK: 0,
    contextualScoreThreshold: 0.7, // higher bar — a confident wrong ID is worse than a wrong fact
    globalScoreThreshold: null,
    geoFiltered: true,
    highlightFiltered: false,
    promptAddition:
      "The visitor is looking at something specific right now. Identify it clearly and confidently " +
      "if the retrieved context supports it. If no strong match exists, say so plainly rather than guessing.",
    maxResponseTokens: 250,
  },

  /**
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
    highlightFiltered: false,
    promptAddition:
      "Compare and contrast the items directly. Structure the answer around 2-3 concrete points " +
      "of similarity or difference rather than describing each item separately.",
    maxResponseTokens: 400,
  },

  /**
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
    highlightFiltered: false,
    promptAddition:
      "Answer in a narrative, descriptive style, grounded in what's nearby.",
    maxResponseTokens: 400,
  },

  /**
   * interpretive
   * "Why is this artist considered a pioneer?"
   * "What was the cultural context for this movement?"
   * "What was the artist reacting against?"
   */
  interpretive: {
    tools: ["pinecone_contextual", "pinecone_global", "wiki_fallback"],
    contextualTopK: 2, // light anchor to current location
    globalTopK: 8, // Topic/Person carries the real weight
    contextualScoreThreshold: 0.65,
    globalScoreThreshold: 0.55, // loosened deliberately — wide net for synthesis material
    geoFiltered: true,
    highlightFiltered: false,
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
    highlightFiltered: true, // is_highlight: true first pass; pipeline re-queries without it if starved
    promptAddition:
      "Present the answer as a ranked, scannable list. Give one short line of reasoning per item " +
      "explaining why it's worth seeing, ordered by how strongly it's recommended.",
    maxResponseTokens: 500,
  },

  navigational_facility: {
    tools: ["redis_facility"],
    contextualTopK: 0,
    globalTopK: 0,
    contextualScoreThreshold: null,
    globalScoreThreshold: null,
    geoFiltered: false,
    highlightFiltered: false,
    promptAddition:
      "Give clear, brief directions to the amenity. No extra context needed.",
    maxResponseTokens: 100,
  },

  navigational_locate: {
    tools: ["pinecone_contextual", "redis_geo"],
    contextualTopK: 1,
    globalTopK: 0,
    contextualScoreThreshold: 0.75, // institution-wide lookup — needs near-exact match or should defer, not guess
    globalScoreThreshold: null,
    geoFiltered: false, // deliberately NOT geo-scoped — they're asking because it's not nearby
    highlightFiltered: false,
    promptAddition:
      "Give the location and, if available, brief directions from the visitor's current position. " +
      "If the match confidence is low, ask a clarifying question instead of guessing.",
    maxResponseTokens: 150,
  },

  navigational_route: {
    tools: ["route_planner"],
    contextualTopK: 0,
    globalTopK: 0,
    contextualScoreThreshold: null,
    globalScoreThreshold: null,
    geoFiltered: true,
    highlightFiltered: true, // candidate stops pulled via is_highlight + any query constraints (place_type, etc.)
    promptAddition:
      "Present the route as an ordered list of stops with estimated time at each and walking time " +
      "between them. Mention the total estimated duration up front.",
    maxResponseTokens: 500,
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
    highlightFiltered: false,
    promptAddition:
      "Answer directly from the operational data provided. No elaboration needed.",
    maxResponseTokens: 100,
  },
};
