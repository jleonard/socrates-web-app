import { redirect, data, type LoaderFunctionArgs } from "react-router";
import { getSupabaseServerClient } from "~/utils/supabase.server";
import { getSessionId, sessionStorage } from "~/sessions.server";
import { userHasAccess } from "~/server/access.manager.server";
import { setUserPromo } from "~/server/promo.manager.server";
import { upsertUserProfile } from "~/server/user.last-seen.server";
import type { AccessRecord } from "~/types";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseServerClient(request);
  const { session, sessionId } = await getSessionId(request);

  const url = new URL(request.url);
  const place = url.searchParams.get("place");
  const promo = url.searchParams.get("promo");

  // save place before any redirects
  if (place) {
    session.set("place", place);
  }

  // save promo before any redirect
  if (promo) {
    session.set("promo", promo);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw redirect("/login", {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  }

  // Upsert profile data on every load
  const { data: profile, error } = await upsertUserProfile(
    { user_id: user.id, email: user.email },
    request,
  );

  // set the promo for the user
  const { data: promoRecord, error: promoError } = await setUserPromo(
    user.id,
    session.get("promo"),
    supabase,
  );
  if (promoRecord) {
    session.unset("promo");
  }

  // check if the user has access
  const access = await userHasAccess(user.id, supabase);

  // none means this user never had access
  if (access?.category === "none") {
    throw redirect("/purchase", {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  }

  // expired access
  if (access?.category === "expired") {
    throw redirect("/expiration", {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  }

  // if you haven't onboarded, go do it
  if (!profile.has_onboarded) {
    throw redirect("/welcome", {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  }

  // @todo sentry
  if (error) {
    console.log("sb error: ", error);
  }

  return data(
    {
      access: access as AccessRecord | null,
      pageTitle: "WonderWay",
      user: user,
      user_profile: error ? {} : profile,
      sessionId,
      n8nEndpoint:
        "https://leonardalonso.app.n8n.cloud/webhook-test/aa41599c-3236-45a5-8c17-a9702d3a56f7o",
      elevenLabsId: process.env.ELEVENLABS_AGENT!,
      env: {
        SUPABASE_URL: process.env.SUPABASE_URL!,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
      },
      place: session.get("place"),
    },
    {
      headers: {
        "Set-Cookie": await sessionStorage.commitSession(session),
      },
    },
  );
}
