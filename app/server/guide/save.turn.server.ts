import type { AgentChatMessage } from "~/types";
import type { Database, Json } from "~/types/supabase";
import { APP_VERSION } from "~/utils/app.version";
import { logAppEvent } from "~/utils/events/appEvents.server";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";
import { appendChatHistory } from "./chat.history.server";

/** How the reply was produced. */
export type TurnSource = "grounded" | "general" | "cache";

/**
 * Version of the `details` shape written to agent_history and event_log.
 * Bump when the shape changes so old and new rows can be told apart in SQL.
 */
const DETAILS_VERSION = 1;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Saves one completed exchange, three writes in parallel:
 *
 * - chat history (`chat:<user_id>`): follow-ups and the history agent
 * - agent_history: the FULL record, everything in `details`. Only the
 *   columns that are filtered, searched or written by people are set; the
 *   older tool_* / rag_* / text_* columns are deprecated and left empty.
 * - event_log: a SLIM timeline event that points to the full record via
 *   details.request_id, instead of duplicating it.
 *
 * Each failure is logged, never thrown: logging can't fail an answer.
 */
export async function saveTurn(opts: {
  userId: string | undefined;
  conversationId: string | undefined;
  history: AgentChatMessage[];
  visitorQuery: string;
  reply: string;
  source: TurnSource;
  responseTimeMs: number;
  loggingDetails: Record<string, any>;
}): Promise<void> {
  const { loggingDetails: d } = opts;
  const userId = opts.userId && UUID_RE.test(opts.userId) ? opts.userId : null;
  const conversationId = opts.conversationId ?? null;

  const historyRow: Database["public"]["Tables"]["agent_history"]["Insert"] = {
    user_id: userId,
    conversation_id: conversationId,
    app_version: APP_VERSION,
    query: opts.visitorQuery,
    response: opts.reply,
    response_time: Math.round(opts.responseTimeMs),
    // the guide has no query types; record how the answer was produced
    query_classification: `guide:${opts.source}`,
    details: toJson({ v: DETAILS_VERSION, webhook: "guide", ...d }),
  };

  const { supabase } = getSupabaseServiceRoleClient();

  const results = await Promise.allSettled([
    appendChatHistory(opts.userId, opts.history, opts.visitorQuery, opts.reply),

    supabase
      .from("agent_history")
      .insert(historyRow)
      .then(({ error }) => {
        if (error) throw error;
      }),

    logAppEvent({
      event_type: "agent_webhook",
      event_message: `guide answered (${opts.source})`,
      user_id: userId,
      conversation_id: conversationId,
      source: "server",
      event_details: {
        v: DETAILS_VERSION,
        webhook: "guide",
        request_id: d.request_id,
        location_id: d.location?.locationId ?? null,
        mode: opts.source,
        query: d.query,
        cache: d.cache
          ? {
              would_hit: d.cache.would_hit,
              best_similarity: d.cache.best_similarity,
            }
          : null,
        selected: d.retrieval?.counts?.final ?? null,
        rerank_failed: d.retrieval?.rerank_failed ?? null,
        timing: d.timing,
        error: d.answer?.error ?? null,
      },
    }),
  ]);

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(
        `[guide] saveTurn ${["chat_history", "agent_history", "event_log"][i]} failed`,
        r.reason,
      );
    }
  });
}

/** loggingDetails is plain JSON-safe data; this only satisfies the Json type. */
function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
