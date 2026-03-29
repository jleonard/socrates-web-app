export type ProductInfo = {
  code: string;
  hours: number;
};

export type HistoryLog = {
  user_id: string;
  query: string;
  response: string;
  tool_cache: boolean;
  tool_rag: boolean;
  tool_wikipedia: boolean;
  response_time: number;
  rag_score?: number;
  text_wikipedia?: string | null;
  text_rag?: string | null;
};
