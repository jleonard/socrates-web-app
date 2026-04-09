import type { Database } from "~/types/supabase";

export type AccessRow = Database["public"]["Tables"]["access"]["Row"];
export type AccessCategory = "active" | "unused" | "expired" | "trial" | "none";
export type AccessRecord = AccessRow & { category: AccessCategory };

export type AgentResponse =
  Database["public"]["Tables"]["agent_history"]["Row"];

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
  tool_cache: boolean;
  tool_rag: boolean;
  tool_wikipedia: boolean;
  tool_followup: boolean;
  "tool_fix-speech"?: boolean;
  "query-before-fixing"?: string;
  response_time: number;
  rag_score?: number;
  text_wikipedia?: string | null;
  text_rag?: string | null;
  rag_index: string | null;
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
