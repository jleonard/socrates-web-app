import { redirect, type LoaderFunctionArgs } from "react-router";
import {
  getSupabaseServiceRoleClient,
  getSupabaseServerClient,
} from "~/utils/supabase.server";
import { getSessionId, sessionStorage } from "~/sessions.server";
import { upsertUserProfile } from "~/server/user.last-seen.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase: subabaseServiceRole } =
    getSupabaseServiceRoleClient(request);
  const { supabase: userSupabase } = getSupabaseServerClient(request);
  const { session, sessionId } = await getSessionId(request);

  const {
    data: { user },
  } = await userSupabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  // Upsert profile data on every load
  const { data: profile, error } = await upsertUserProfile(
    { user_id: user.id, email: user.email },
    request
  );

  // @todo sentry
  if (error) {
    console.log("sb error: ", error);
  }

  if (profile.role !== "admin") {
    return redirect("/app");
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const { data: activeUsers, error: activeUsersError } =
    await subabaseServiceRole
      .from("profiles")
      .select(
        `
      id,
      user_id,
      created_at,
      last_seen,
      email,
      role
    `
      )
      .eq("role", "user")
      .gte("last_seen", since.toISOString());

  const { data: allAccess, error: allAccessError } = await subabaseServiceRole
    .from("access")
    .select("*")
    .gte("created_at", since.toISOString());

  const usersWithAccess = activeUsers?.map((u) => ({
    ...u,
    access: allAccess?.filter((a) => a.user_id === u.user_id) ?? [],
  }));

  const { data: purchases, error: purchasesError } = await subabaseServiceRole
    .from("purchases")
    .select("*")
    .gte("created_at", since.toISOString());

  return Response.json(
    {
      pageTitle: "WonderWay",
      user: user,
      user_profile: error ? {} : profile,
      sessionId,
      activeUsers: usersWithAccess ?? [],
      purchases: purchases ?? [],
      env: {
        SUPABASE_URL: process.env.SUPABASE_URL!,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
      },
    },
    {
      headers: {
        "Set-Cookie": await sessionStorage.commitSession(session),
      },
    }
  );
}
