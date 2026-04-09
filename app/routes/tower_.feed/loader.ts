import { redirect, data, type LoaderFunctionArgs } from "react-router";
import {
  getSupabaseServiceRoleClient,
  getSupabaseServerClient,
} from "~/utils/supabase.server";
import { getSessionId, sessionStorage } from "~/sessions.server";
import { upsertUserProfile } from "~/server/user.last-seen.server";
import type { AppEventLog } from "~/types";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase: userSupabase } = getSupabaseServerClient(request);
  const { session, sessionId } = await getSessionId(request);
  const SUPABASE_TABLE = "event_log";

  /**
   * route guard
   */
  const {
    data: { user },
  } = await userSupabase.auth.getUser();
  if (!user) {
    return redirect("/login");
  }

  const { data: profile, error } = await upsertUserProfile(
    { user_id: user.id, email: user.email },
    request,
  );

  if (error) {
    console.log("sb error: ", error);
  }

  if (profile.role !== "admin") {
    return redirect("/app");
  }
  /**
   * end guard
   */

  const url = new URL(request.url);
  const search = url.searchParams.get("q") || "";
  const page = parseInt(url.searchParams.get("page") || "0");
  const PAGE_SIZE = 30;

  // Use service role client to query all users' agent responses
  const { supabase } = getSupabaseServiceRoleClient();

  let query = supabase
    .from(SUPABASE_TABLE)
    .select("*", { count: "exact" })
    .order("created_at", { ascending: true })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (search) {
    query = query.ilike("event_message", `%${search}%`);
  }

  const { data: entries, count, error: queryError } = await query;

  if (queryError) {
    console.log("sb query error: ", queryError);
  }

  return data(
    {
      entries: (entries ?? []) as AppEventLog[],
      total: count ?? 0,
      page,
      search,
      pageSize: PAGE_SIZE,
    },
    {
      headers: {
        "Set-Cookie": await sessionStorage.commitSession(session),
      },
    },
  );
}
