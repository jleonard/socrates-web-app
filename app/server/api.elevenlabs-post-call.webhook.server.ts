import type { ActionFunction } from "react-router";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";
import * as Sentry from "@sentry/react-router";

/**
 * This webhook is called by elevenlabs when a conversation ends.
 * @param param
 * @returns
 */

// TODO - implement a check for the elevenlabs secret
// this is it
// wsec_14bb0f3bde34491be0cd064774297cd1b4701eddbefc272ab334be0c189f3d0c
export const handleWebhook: ActionFunction = async ({ request }) => {
  try {
    const body = await request.json();
    const payload = body?.data;
    const summary = payload?.analysis?.transcript_summary;
    const cost = payload?.metadata?.cost;
    const duration = payload?.metadata?.call_duration_secs;
    const user_session =
      payload?.conversation_initiation_client_data?.dynamic_variables
        ?.user_session;
    const dynamic_variables =
      payload?.conversation_initiation_client_data?.dynamic_variables;
    const user_id = user_session.split("__")[0];
    let transcript = [];
    for (const item of payload?.transcript ?? []) {
      const message = item?.message ?? null;
      const role = item?.role ?? null;
      const tool =
        item?.tool_calls
          ?.map((t: { tool_name?: string }) => t.tool_name)
          .filter(Boolean)
          .join(", ") ?? null;
      // timing for latency QA: when the turn happened, how long tools took,
      // and ElevenLabs' own per-turn metrics (LLM / TTS time to first byte)
      const tool_latency_secs =
        item?.tool_results
          ?.map((t: { tool_latency_secs?: number }) => t.tool_latency_secs)
          .filter((s: unknown) => typeof s === "number") ?? [];
      const turn = {
        role,
        message,
        tool,
        time_in_call_secs: item?.time_in_call_secs ?? null,
        interrupted: item?.interrupted ?? null,
        tool_latency_secs: tool_latency_secs.length ? tool_latency_secs : null,
        metrics: item?.conversation_turn_metrics?.metrics ?? null,
      };
      console.log("tool calls ", item?.tool_calls);
      console.log("turn ", turn);

      transcript.push(turn);
    }
    let entry = {
      summary,
      elevenlabs_tokens: cost,
      user_id,
      transcript: { transcript },
      duration,
      dynamic_variables,
    };
    const { supabase: subabaseServiceRole } = getSupabaseServiceRoleClient();
    const { error } = await subabaseServiceRole
      .from("elevenlabs_history")
      .insert(entry);
    if (error) {
      console.error("supabase error : ", JSON.stringify(error));
    } else {
      return new Response("OK", { status: 200 });
    }
  } catch (err) {
    Sentry.captureException(err);
    // @TODO - log this to sentry
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
