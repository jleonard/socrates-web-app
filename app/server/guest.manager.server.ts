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

/**
 * Converts a guest into the real account that just signed in: moves the
 * guest's history, access and app events to `authUserId`, then deletes the
 * guest. Call it only when a REAL (non-anonymous) user is signed in.
 *
 * Until Nov 2026 the /app loader called this for every signed-in user,
 * including the guest itself (authUserId === guest_id), so on every load a
 * guest "moved" its rows onto itself and tried to delete its own account.
 * That failed only because the guest's `access` row blocks the delete; a
 * guest without one would have been deleted mid-visit.
 *
 * Deleting a guest removes its `profiles` row (cascade) but leaves
 * `event_log` rows behind, so those are moved too.
 */
export async function signOutGuest(authUserId: string, session: Session) {
  const guestId = session.get("guest_id");
  if (typeof guestId !== "string" || !guestId) return;

  // the guest itself is signed in: nothing to convert, never delete it
  if (guestId === authUserId) return;

  const { supabase } = getSupabaseServiceRoleClient();
  const move = (
    table: "elevenlabs_history" | "agent_history" | "access" | "event_log",
  ) =>
    supabase.from(table).update({ user_id: authUserId }).eq("user_id", guestId);

  const results = await Promise.all([
    move("elevenlabs_history"),
    move("agent_history"),
    move("access"),
    move("event_log"),
  ]);
  const moveError = results.find((r) => r.error)?.error ?? null;

  const { error: deleteError } = moveError
    ? { error: null }
    : await supabase.auth.admin.deleteUser(guestId);

  if (moveError || deleteError) {
    Sentry.captureMessage("guest.manager converting guest to user", {
      level: "error",
      extra: { guestId, authUserId, moveError, deleteError },
    });
  }

  // Clear it either way: a failure is reported once, not retried (and
  // re-reported) on every page load. A leftover guest account is harmless.
  session.unset("guest_id");
}
