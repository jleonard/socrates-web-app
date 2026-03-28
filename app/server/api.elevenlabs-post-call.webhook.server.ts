import type { ActionFunction } from "react-router";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";

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
    // console.log("payload: ", payload.conversation_initiation_client_data);
    //X analysis.transcript_summary = text
    // metadata.cost = number of tokens
    // metadata
    //      call_duration_secs
    //      start_time_unix_secs
    // transcript []
    //      role
    //      message (sometimes null)
    //      tool_calls (sometimes null)
    //          tool_name
    //          tool_latency_secs
    // conversation_initiation_client_data.dynamic_variables.
    //      user_session
    // (payload)
    const summary = payload?.analysis?.transcript_summary;
    const cost = payload?.metadata?.cost;
    const duration = payload?.metadata?.call_duration_secs;
    const user_session =
      payload?.conversation_initiation_client_data?.dynamic_variables
        ?.user_session;
    const user_id = user_session.split("__")[0];
    let transcript = [];
    for (const item of payload?.transcript ?? []) {
      const message = item?.message; // sometimes this is null;
      const role = item?.role;
      const tool = item?.tool_calls?.tool_name; // sometimes this is null
      const turn = { role, message, tool };
      console.log("turn: ", turn);
      transcript.push(turn);
    }
    let entry = {
      summary,
      elevenlabs_tokens: cost,
      user_id,
      transcript: { transcript },
      duration,
    };
    console.log("entry ", entry);
    const { supabase: subabaseServiceRole } = getSupabaseServiceRoleClient();
    const { error } = await subabaseServiceRole
      .from("elevenlabs_history")
      .upsert(entry);
    if (error) {
      console.error("supabase error : ", error.message);
    }
  } catch (err) {
    console.log("error: ", err);
    // @TODO - log this to sentry
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
