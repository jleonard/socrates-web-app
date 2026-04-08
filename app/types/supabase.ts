export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      access: {
        Row: {
          access_id: string
          created_at: string
          expiration: string | null
          "expiration-deprecated": string | null
          hours: number
          id: number
          product_code: string | null
          promo_code: string | null
          user_id: string
        }
        Insert: {
          access_id?: string
          created_at?: string
          expiration?: string | null
          "expiration-deprecated"?: string | null
          hours?: number
          id?: number
          product_code?: string | null
          promo_code?: string | null
          user_id?: string
        }
        Update: {
          access_id?: string
          created_at?: string
          expiration?: string | null
          "expiration-deprecated"?: string | null
          hours?: number
          id?: number
          product_code?: string | null
          promo_code?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      agent_history: {
        Row: {
          created_at: string
          id: number
          qa: string | null
          query: string | null
          query_classification: string | null
          rag_index: string | null
          rag_score: number | null
          response: string | null
          response_time: number | null
          text_rag: string | null
          text_wikipedia: string | null
          tool_cache: boolean | null
          tool_followup: boolean | null
          tool_rag: boolean | null
          tool_wikipedia: boolean | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          qa?: string | null
          query?: string | null
          query_classification?: string | null
          rag_index?: string | null
          rag_score?: number | null
          response?: string | null
          response_time?: number | null
          text_rag?: string | null
          text_wikipedia?: string | null
          tool_cache?: boolean | null
          tool_followup?: boolean | null
          tool_rag?: boolean | null
          tool_wikipedia?: boolean | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          qa?: string | null
          query?: string | null
          query_classification?: string | null
          rag_index?: string | null
          rag_score?: number | null
          response?: string | null
          response_time?: number | null
          text_rag?: string | null
          text_wikipedia?: string | null
          tool_cache?: boolean | null
          tool_followup?: boolean | null
          tool_rag?: boolean | null
          tool_wikipedia?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      elevenlabs_history: {
        Row: {
          created_at: string
          duration: number | null
          elevenlabs_tokens: number | null
          id: number
          qa: string | null
          summary: string | null
          transcript: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration?: number | null
          elevenlabs_tokens?: number | null
          id?: number
          qa?: string | null
          summary?: string | null
          transcript?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration?: number | null
          elevenlabs_tokens?: number | null
          id?: number
          qa?: string | null
          summary?: string | null
          transcript?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      logs_elevenlabs: {
        Row: {
          call_duration_seconds: number | null
          conversation_id: string
          cost: number | null
          created_at: string
          id: number
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          call_duration_seconds?: number | null
          conversation_id: string
          cost?: number | null
          created_at?: string
          id?: number
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          call_duration_seconds?: number | null
          conversation_id?: string
          cost?: number | null
          created_at?: string
          id?: number
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      n8n_cached_responses: {
        Row: {
          cache_key: string
          created_at: string
          hits: number
          id: number
          last_accessed: string
          last_updated: string | null
          response: string | null
          ttl: number | null
        }
        Insert: {
          cache_key: string
          created_at?: string
          hits?: number
          id?: number
          last_accessed?: string
          last_updated?: string | null
          response?: string | null
          ttl?: number | null
        }
        Update: {
          cache_key?: string
          created_at?: string
          hits?: number
          id?: number
          last_accessed?: string
          last_updated?: string | null
          response?: string | null
          ttl?: number | null
        }
        Relationships: []
      }
      n8n_chat_histories: {
        Row: {
          created: string | null
          id: number
          message: Json
          place: string | null
          session_id: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          created?: string | null
          id?: number
          message: Json
          place?: string | null
          session_id: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created?: string | null
          id?: number
          message?: Json
          place?: string | null
          session_id?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      n8n_chat_memory: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      places: {
        Row: {
          created_at: string
          id: string
          message: Json | null
          name: string | null
        }
        Insert: {
          created_at?: string
          id: string
          message?: Json | null
          name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: Json | null
          name?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          has_onboarded: boolean | null
          id: number
          last_greeted: string | null
          last_seen: string | null
          promo_code: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          has_onboarded?: boolean | null
          id?: number
          last_greeted?: string | null
          last_seen?: string | null
          promo_code?: string | null
          role?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          has_onboarded?: boolean | null
          id?: number
          last_greeted?: string | null
          last_seen?: string | null
          promo_code?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: []
      }
      promos: {
        Row: {
          code: string
          created_at: string
          description: string | null
          expiration: string | null
          hours: number | null
          id: number
          quantity: number | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          expiration?: string | null
          hours?: number | null
          id?: number
          quantity?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          expiration?: string | null
          hours?: number | null
          id?: number
          quantity?: number | null
        }
        Relationships: []
      }
      purchases: {
        Row: {
          access_id: string | null
          created_at: string
          id: number
          product_hours: number
          stripe_amount_total: number
          stripe_currency: string
          stripe_payment_intent: string
          stripe_payment_status: string
          stripe_product_code: string
          stripe_session_id: string
          user_id: string
        }
        Insert: {
          access_id?: string | null
          created_at?: string
          id?: number
          product_hours: number
          stripe_amount_total: number
          stripe_currency: string
          stripe_payment_intent: string
          stripe_payment_status: string
          stripe_product_code: string
          stripe_session_id: string
          user_id?: string
        }
        Update: {
          access_id?: string | null
          created_at?: string
          id?: number
          product_hours?: number
          stripe_amount_total?: number
          stripe_currency?: string
          stripe_payment_intent?: string
          stripe_payment_status?: string
          stripe_product_code?: string
          stripe_session_id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_documents: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      match_perso_documents: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
