import { data, type ActionFunctionArgs } from "react-router";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";
import * as Sentry from "@sentry/react-router";

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const id = form.get("id") as string;
  const qa = form.get("qa") as string;

  const { supabase } = getSupabaseServiceRoleClient();

  const { data: entry, error } = await supabase
    .from("agent_history")
    .update({ qa })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    Sentry.captureMessage("agent_history update failed", {
      level: "error",
      extra: { id, error },
    });
    return data({ error: error.message }, { status: 500 });
  }

  return data({ entry });
}
