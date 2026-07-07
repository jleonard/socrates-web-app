import type { Database } from "~/types/supabase";

export type AccessRow = Database["public"]["Tables"]["access"]["Row"];
export type AccessCategory = "active" | "unused" | "expired" | "trial" | "none";
export type AccessRecord = AccessRow & { category: AccessCategory };

export type AgentChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// Every retrieval/action primitive available to the pipeline.
// A given query type declares which of these it needs, in order.
export type AgentToolName =
  | "pinecone_contextual" // vector search, contextual namespace
  | "pinecone_global" // vector search, global namespace (Topic, Person)
  | "redis_geo" // nearbyPlaceIds lookup (already resolved pre-classification, but some types re-key off it)
  | "redis_operational" // shared.operational-info lookup, keyed by institution/place
  | "redis_facility" // amenities lookup, keyed by place
  | "route_planner" // multi-stop itinerary builder
  | "wiki_fallback"; // Wikipedia search, only fired if RAG coverage is weak

export interface AgentConfig {
  /** Tools invoked for this query type, in the order they should run.
   *  Pipeline treats this as authoritative — no separate if/else branching on type. */
  tools: AgentToolName[];

  /** Pinecone contextual namespace top-K. 0 = skip. */
  contextualTopK: number;

  /** Pinecone global namespace top-K. 0 = skip. */
  globalTopK: number;

  /** Minimum score to keep a contextual match. null = no score gate (filter-driven instead, e.g. discovery). */
  contextualScoreThreshold: number | null;

  /** Minimum score to keep a global match. null = no score gate. */
  globalScoreThreshold: number | null;

  /** Apply { place_id: { $in: nearbyPlaceIds } } filter on the contextual query. */
  geoFiltered: boolean;

  /** Apply { is_highlight: { $eq: true } } filter (with highlight_rank sort) on the contextual query. */
  highlightFiltered: boolean;

  /** Text appended to the system prompt for this query type — controls response shape/tone.
   *  Empty string = use the base system prompt with no addition. */
  promptAddition: string;

  /** Max tokens to allow in the generated response. Keeps factual/navigational answers short,
   *  gives interpretive/discovery room to synthesize or list. */
  maxResponseTokens: number;
}

export type AgentQueryType =
  | "factual" //— specific fact lookup
  | "visual_id" //— identify what's in front of them
  | "comparative" //— relate/contrast two or more things
  | "contextual" //— narrative background on one thing
  | "interpretive" //— meaning, significance, or story of one thing
  | "discovery" //— recommend/rank across many things
  | "navigational_facility" //— amenities, pure Redis
  | "navigational_locate" //— find a specific named thing
  | "navigational_route" //— multi-stop itinerary
  | "operational"; //— hours, tickets, accessibility, pure metadata (new)

export type AgentResponse =
  Database["public"]["Tables"]["agent_history"]["Row"];

export type AppEventLog = Database["public"]["Tables"]["event_log"]["Row"];

export type ElevenLabsConversation =
  Database["public"]["Tables"]["elevenlabs_history"]["Row"];

export type ElevenLabsConverstaionTurnRole = "user" | "agent";

export type ElevenLabsConversationTurn = {
  role: ElevenLabsConverstaionTurnRole;
  tool: string | null;
  message: string | null;
};

export type ElevenLabsConversationTranscript = {
  transcript: ElevenLabsConversationTurn[];
};

export type HistoryLog = {
  user_id: string;
  query: string;
  query_classification: string;
  response: string;
  tool_cache?: boolean;
  tool_rag?: boolean;
  tool_wikipedia?: boolean;
  tool_followup?: boolean;
  "tool_fix-speech"?: boolean;
  "query-before-fixing"?: string;
  response_time: number;
  rag_score?: number;
  text_wikipedia?: string | null;
  text_rag?: string | null;
  rag_index?: string | null;
  tools?: ToolLog[];
  details?: Record<string, unknown>;
};

export type ToolLog = {
  tool: "cache" | "rag" | "wikipedia" | "followup" | "fix-speech";
  details?: Record<string, unknown>; // score, index, original_query, text, etc.
};

export type ProductInfo = {
  code: string;
  hours: number;
};

export type PromoRow = Database["public"]["Tables"]["promos"]["Row"];

export type RedisEntry = {
  key: string;
  answer: string;
  tool: string;
  embedding: string;
  hits: string;
  question: string;
};

export type UserProfile = Database["public"]["Tables"]["profiles"]["Row"];

export type UserProfileInsert =
  Database["public"]["Tables"]["profiles"]["Insert"];
