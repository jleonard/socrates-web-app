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
   *  Pipeline treats this as authoritative — no separate if/else branching on type.
   *  Note: "wiki_fallback" is no longer handled by the webhook, so no config
   *  sets it. Keep it in AgentToolName only if other code still references it. */
  tools: AgentToolName[];

  /** Pinecone contextual namespace top-K. 0 = skip. This sets how many
   *  candidates the reranker sees, not how many reach the model. */
  contextualTopK: number;

  /** Pinecone global namespace top-K. 0 = skip. Same meaning as above. */
  globalTopK: number;

  /**
   * @deprecated Relevance is now decided by the reranker (RERANK_MIN in
   * rag.retrieve.ts). No longer read by the webhook. Kept optional so old
   * configs still compile; delete once nothing references it.
   */
  contextualScoreThreshold?: number | null;

  /**
   * @deprecated See contextualScoreThreshold.
   */
  globalScoreThreshold?: number | null;

  /** Apply the place/exhibition scope filter on the contextual query. */
  geoFiltered: boolean;

  /** When set, narrows geoFiltered types to real lat/lng proximity via
   *  resolveNearbyItems(), replacing the plain place/exhibition $eq.
   *  Omit to keep geoFiltered institution-scoping without proximity narrowing. */
  nearbyRadiusMeters?: number;

  /** Used with nearbyRadiusMeters to limit how many nearby items to consider
   *  (filters out noise). */
  nearbyLimit?: number;

  /** Text added as a system message for this query type, just before the
   *  visitor's question — controls response shape/tone and grounding rules.
   *  Empty string = no addition. */
  promptAddition: string;

  /** Max tokens to allow in the generated response. Acts as a ceiling, not a
   *  target: hitting it cuts the reply mid-sentence, so keep it above the
   *  length the promptAddition asks for. */
  maxResponseTokens: number;
}

export type AgentQueryType =
  | "factual" //— specific fact lookup
  | "visual_id" //— identify what's in front of them
  | "comparative" //— relate/contrast two or more things
  | "contextual" //— narrative background on one thing
  | "interpretive" //— meaning, significance, or story of one thing
  | "discovery"; //— recommend/rank across many things

export type AgentResponse =
  Database["public"]["Tables"]["agent_history"]["Row"];

export type AppEventLog = Database["public"]["Tables"]["event_log"]["Row"];

// used for RAG ingest
export type DropboxAssetRow =
  Database["public"]["Tables"]["dropbox_assets"]["Insert"];

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
