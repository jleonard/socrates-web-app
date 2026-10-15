import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/types/supabase";
import { APP_VERSION } from "~/utils/app.version";

export type LogAppEventType =
  | "user_log_in"
  | "user_new"
  | "error"
  | "warning"
  | "info"
  | "log"
  | "conversation_started"
  | "conversation_ended"
  | "user_spoke"
  | "agent_spoke"
  | "agent_log"
  | "agent_webhook"
  | "agent_webhook_rag"
  | "purchase";

export type LogAppEventProps = {
  event_type: LogAppEventType;
  event_message?: string;
  event_details?: Record<string, unknown> | null;
  /** Defaults to event_details.user_id. Stored only if it's a valid UUID. */
  user_id?: string | null;
  /** Defaults to event_details.conversation_id. */
  conversation_id?: string | null;
  /** Where the event came from: "server" or "client". */
  source?: "server" | "client";
};

let supabaseClient: ReturnType<typeof createClient<Database>> | null = null;

function getServiceClient() {
  if (!supabaseClient) {
    supabaseClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
  }
  return supabaseClient;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Never throws: logging must not break the caller. */
export async function logAppEvent({
  event_type,
  event_message = "",
  event_details = {},
  user_id,
  conversation_id,
  source,
}: LogAppEventProps) {
  const details = event_details ?? {};
  const userId = user_id ?? details.user_id;
  const conversationId = conversation_id ?? details.conversation_id;

  try {
    const { error } = await getServiceClient()
      .from("event_log")
      .insert({
        event_type,
        event_message,
        event_details:
          details as Database["public"]["Tables"]["event_log"]["Insert"]["event_details"],
        // user_id is a uuid column: a bad value would fail the whole insert
        user_id:
          typeof userId === "string" && UUID_RE.test(userId) ? userId : null,
        conversation_id:
          typeof conversationId === "string" ? conversationId : null,
        app_version: APP_VERSION,
        source: source ?? null,
        created_at: new Date().toISOString(),
      });

    // insert() reports failures in `error`, it doesn't throw
    if (error) console.error("logAppEvent insert failed:", error);
  } catch (err) {
    console.error("logAppEvent error:", err);
  }
}
