import { redirect, data, type LoaderFunctionArgs } from "react-router";
import { getSupabaseServerClient } from "~/utils/supabase.server";
import { getSessionId, sessionStorage } from "~/sessions.server";
import { userHasAccess } from "~/server/access.manager.server";
import { signInGuest, signOutGuest } from "~/server/guest.manager.server";
import { setUserPromo, getPromo } from "~/server/promo.manager.server";
import { upsertUserProfile } from "~/server/user.last-seen.server";
import type { AccessRecord, UserProfile } from "~/types";
import type { UserProfileInsert } from "~/types";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers: supabaseHeaders } =
    getSupabaseServerClient(request);
  const { session, sessionId } = await getSessionId(request);

  const buildHeaders = async () => {
    const headers = new Headers(supabaseHeaders);
    headers.append("Set-Cookie", await sessionStorage.commitSession(session));
    return headers;
  };

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

  let user;

  // check for a signed in user
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (authUser) {
    user = authUser;
    signOutGuest(authUser.id, session);
  }

  // if there's no user, check if the promo allows guest access before redirecting
  if (!user && promo) {
    const { data: promoDeets, error: promoDeetsError } = await getPromo(
      promo,
      supabase,
    );

    if (promoDeets?.allow_guest) {
      const { user: guestUser, error: guestError } = await signInGuest(
        supabase,
        session,
      );
      console.log("guest user ", guestUser);
      if (guestUser) {
        user = guestUser;
      }
    }
  }

  console.log("last check user ", user?.id);

  // if no signed in user OR no guest access allowed on the promo, redirect
  if (!user) {
    throw redirect("/login", {
      headers: await buildHeaders(),
      //headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  }

  // Upsert profile data on every load
  let profileUpsert: UserProfileInsert = {
    user_id: user.id,
    email: user.email,
    role: user.is_anonymous ? "guest" : "user",
  };

  // corner case for mit. hele doesn't want MIT guests to go through FTUE
  if (place && place === "mit" && user.is_anonymous) {
    profileUpsert.has_onboarded = true;
  }

  const { data: profile, error } = await upsertUserProfile(profileUpsert);

  // set the promo for the user
  const { data: promoRecord, error: promoError } = await setUserPromo(
    user.id,
    session.get("promo"),
    supabase,
  );
  if (promoRecord) {
    session.unset("promo");
  }

  // check if the user has an access record
  const access = await userHasAccess(user.id, supabase);

  // none means this user never had access
  if (access?.category === "none") {
    throw redirect("/purchase", {
      headers: await buildHeaders(),
      //headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  }

  // expired access
  if (access?.category === "expired") {
    throw redirect("/expiration", {
      headers: await buildHeaders(),
      //headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  }

  // if you haven't onboarded, go do it
  if (!profile.has_onboarded) {
    throw redirect("/welcome", {
      headers: await buildHeaders(),
      //headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
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
      user_profile: profile as UserProfile,
      sessionId,
      n8nEndpoint:
        "https://leonardalonso.app.n8n.cloud/webhook-test/aa41599c-3236-45a5-8c17-a9702d3a56f7o",
      elevenLabsId: process.env.ELEVENLABS_AGENT!,
      place: session.get("place"),
    },
    {
      headers: await buildHeaders(),
      /*
      headers: {
        "Set-Cookie": await sessionStorage.commitSession(session),
      },
      */
    },
  );
}
