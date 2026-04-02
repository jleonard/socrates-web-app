import { redirect, data, type LoaderFunctionArgs } from "react-router";
import {
  getSupabaseServiceRoleClient,
  getSupabaseServerClient,
} from "~/utils/supabase.server";
import { getSessionId, sessionStorage } from "~/sessions.server";
import { upsertUserProfile } from "~/server/user.last-seen.server";
import type { AgentResponse } from "~/types";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase: userSupabase } = getSupabaseServerClient(request);
  const { session, sessionId } = await getSessionId(request);

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
  const PAGE_SIZE = 10;

  // Use service role client to query all users' agent responses
  const { supabase } = getSupabaseServiceRoleClient();

  let query = supabase
    .from("agent_history")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (search) {
    query = query.ilike("query", `%${search}%`);
  }

  const { data: entries, count, error: queryError } = await query;

  if (queryError) {
    console.log("sb query error: ", queryError);
  }

  return data(
    {
      entries: (entries ?? []) as AgentResponse[],
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
