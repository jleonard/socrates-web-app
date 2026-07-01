import { SupabaseClient, User, AuthError } from "@supabase/supabase-js";
import { Session } from "react-router";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";
import * as Sentry from "@sentry/react-router";

export async function signInGuest(
  supabase: SupabaseClient,
  session: Session,
): Promise<{ user: User | null; error: AuthError | null }> {
  const { data, error } = await supabase.auth.signInAnonymously();

  if (data?.user) {
    session.set("guest_id", data.user.id);
  }

  if (error) {
    Sentry.captureMessage("guest.manager signInAnonymously()", {
      level: "error",
      extra: { error },
    });
  }

  // todo log the guest creation

  return { user: data?.user, error };
}

export async function signOutGuest(authUserId: string, session: Session) {
  const { supabase } = getSupabaseServiceRoleClient();

  if (session.has("guest_id")) {
    let guestId = session.get("guest_id");

    // migrate all of the elevenlabs history to the real user
    const { error: elevenLabsHistoryError } = await supabase
      .from("elevenlabs_history")
      .update({ user_id: authUserId })
      .eq("user_id", guestId);

    // migrate all of the agent history to the real user
    const { error: agentHistoryError } = await supabase
      .from("agent_history")
      .update({ user_id: authUserId })
      .eq("user_id", guestId);

    // migrate all of the access records to the real user
    const { error: accessError } = await supabase
      .from("access")
      .update({ user_id: authUserId })
      .eq("user_id", guestId);

    // todo - log the conversion

    if (!elevenLabsHistoryError && !agentHistoryError && !accessError) {
      const { error } = await supabase.auth.admin.deleteUser(guestId);
      if (!error) {
        session.unset("guest_id");
      } else {
        Sentry.captureMessage("guest.manager converting guest to user", {
          level: "error",
          extra: { error },
        });
      }
    }
  }
}
