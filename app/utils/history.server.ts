import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";
import { HistoryLog } from "~/types";

export async function logHistory(log: HistoryLog) {
  console.log("log history: ", log);
  const { supabase: subabaseServiceRole } = getSupabaseServiceRoleClient();

  const { error } = await subabaseServiceRole.from("history").upsert(log);

  if (error) {
    console.error("Error logging history:", error);
  }
}
