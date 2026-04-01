import { getRedis } from "~/utils/redis.server";
import { redirect, data, type LoaderFunctionArgs } from "react-router";
import {
  getSupabaseServiceRoleClient,
  getSupabaseServerClient,
} from "~/utils/supabase.server";
import { getSessionId, sessionStorage } from "~/sessions.server";
import { upsertUserProfile } from "~/server/user.last-seen.server";

import type { RedisEntry } from "~/types";

export async function loader({ request }: LoaderFunctionArgs) {
  const redis = await getRedis();
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

  // Upsert profile data on every load
  const { data: profile, error } = await upsertUserProfile(
    { user_id: user.id, email: user.email },
    request,
  );

  // @todo sentry
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

  let cursor = "0";
  const entries: RedisEntry[] = [];

  do {
    const { cursor: next, keys } = await redis.scan(cursor, {
      MATCH: "cache:*",
      COUNT: 50,
    });

    cursor = next;
    if (keys.length) {
      const results = await Promise.all(keys.map((k) => redis.hGetAll(k)));
      keys.forEach((key, i) => {
        const hash = results[i];
        if (
          !search ||
          hash?.question?.toLowerCase().includes(search.toLowerCase())
        ) {
          entries.push({ key, ...hash } as RedisEntry);
        }
      });
    }
  } while (cursor !== "0");

  const total = entries.length;
  const paged = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return data({
    entries: paged,
    total,
    page,
    search,
    pageSize: PAGE_SIZE,
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}
