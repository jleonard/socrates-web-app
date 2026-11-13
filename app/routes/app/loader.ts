import { data, redirect, type LoaderFunctionArgs } from "react-router";
import { getLocale } from "~/middleware/i18next.server";
import { userHasAccess } from "~/server/access.manager.server";
import { signInGuest, signOutGuest } from "~/server/guest.manager.server";
import { getPromo, setUserPromo } from "~/server/promo.manager.server";
import { upsertUserProfile } from "~/server/user.last-seen.server";
import { getSessionId, sessionStorage } from "~/sessions.server";
import type { AccessRecord, UserProfile, UserProfileInsert } from "~/types";
import { getPlaceLanguage } from "~/server/guide/venue.language.server";
import { hasBeenGreeted } from "~/server/greeting.server";
import {
  resolveAgentId,
  startLanguageFor,
} from "~/utils/elevenlabs/agents.server";
import { MIT_PLACE, normalizePlace } from "~/utils/places";
import { getSupabaseServerClient } from "~/utils/supabase.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { supabase, headers: supabaseHeaders } =
    getSupabaseServerClient(request);
  const { session, sessionId } = await getSessionId(request);

  const buildHeaders = async () => {
    const headers = new Headers(supabaseHeaders);
    headers.append("Set-Cookie", await sessionStorage.commitSession(session));
    return headers;
  };

  const locale = getLocale(context);

  const url = new URL(request.url);
  // old ids (`mit`) map to the current one, for the URL and for sessions
  // saved before the rename
  const place = normalizePlace(url.searchParams.get("place"));
  const promo = url.searchParams.get("promo");

  // save place before any redirects
  if (place) {
    session.set("place", place);
  } else if (typeof session.get("place") === "string") {
    session.set("place", normalizePlace(session.get("place")));
  }

  // after saving place: the place can pick the agent (PLACE_AGENTS)
  const agentId = resolveAgentId(url.searchParams.get("agent"), session);

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

  // console.log("last check user ", user?.id);

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
  if (place === MIT_PLACE && user.is_anonymous) {
    profileUpsert.has_onboarded = true;
  }

  const { data: profile, error } = await upsertUserProfile(profileUpsert);

  // A real account signed in after being a guest in this browser: move the
  // guest's history and access over, then delete the guest. Never for a guest
  // (it would try to delete itself). Runs here, after the profile upsert,
  // because `access` references `profiles`: on the first load after sign-in
  // the new user's profile didn't exist yet and the access move failed. And
  // before the access check, so the guest's access counts for the new user.
  // Awaited so session.unset("guest_id") is saved with this response.
  if (!user.is_anonymous) {
    await signOutGuest(user.id, session);
  }

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
  if (!profile || !profile.has_onboarded) {
    throw redirect("/welcome", {
      headers: await buildHeaders(),
      //headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  }

  // @todo sentry
  if (error) {
    console.log("sb error: ", error);
  }

  // the conversation starts in the venue's content language (e.g. Spanish at
  // Parque); the agent's language detection takes over once the visitor speaks
  const [placeLanguage, greeted] = await Promise.all([
    getPlaceLanguage(session.get("place")),
    hasBeenGreeted(user.id, session.get("place")),
  ]);
  const startLanguage = startLanguageFor(agentId, placeLanguage);

  return data(
    {
      access: access as AccessRecord | null,
      pageTitle: "WonderWay",
      user: user,
      user_profile: profile as UserProfile,
      sessionId,
      n8nEndpoint:
        "https://leonardalonso.app.n8n.cloud/webhook-test/aa41599c-3236-45a5-8c17-a9702d3a56f7o",
      elevenLabsId: agentId,
      startLanguage,
      // greeted per place (Redis), so a new venue greets the visitor again
      shouldPlayGreeting: !greeted,
      place: session.get("place"),
      locale,
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
