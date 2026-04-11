import { createClient } from "@supabase/supabase-js";

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
  | "purchase";

export type LogAppEventProps = {
  event_type: LogAppEventType;
  event_message?: string;
  event_details?: Record<string, unknown> | null;
};

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getServiceClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return supabaseClient;
}

export async function logAppEvent({
  event_type,
  event_message = "",
  event_details = {},
}: LogAppEventProps) {
  const supabase = getServiceClient();

  try {
    await (supabase.from("event_log") as any).insert({
      event_type,
      event_message,
      event_details,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("logAppEvent error:", err);
  }
}
