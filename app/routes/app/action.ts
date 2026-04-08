import { ActionFunctionArgs } from "react-router";
import * as Sentry from "@sentry/react-router";
import { betterUpsertUserProfile } from "~/server/user.last-seen.server";
import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";
import { setAccessExpiration } from "~/server/access.manager.server";

export async function action({ request }: ActionFunctionArgs) {
  const { supabase: subabaseServiceRole } = getSupabaseServiceRoleClient();

  const body = await request.formData();

  const intent = body.get("intent");
  const accessId = body.get("access_id");
  const userId = body.get("user_id");

  /*
   * set the expiration for the user's access record
   */
  if (intent === "set-expiration" && accessId) {
    const { data, error } = await setAccessExpiration(
      String(accessId),
      request,
    );
    // todo sentry
    if (error) {
      console.error("Error updating expiration:", error);
      throw new Response("Failed to update expiration", { status: 500 });
    }

    return new Response("Expiration updated", { status: 200 });
  }

  /*
   * check if the access is expired
   */
  if (intent === "check-expiration") {
    return new Response("Expiration check", { status: 200 });
  }

  /*
   * check if the access is expired
   */
  if (intent === "greeted") {
    const userObj = { user_id: String(userId), last_greeted: new Date() };

    const { data, error } = await betterUpsertUserProfile(
      userObj,
      subabaseServiceRole,
    );

    if (error) {
      Sentry.captureMessage("upsertUserProfile failed", {
        level: "error",
        extra: { user: userObj, error },
      });
    }
    return new Response("User greeted", { status: 200 });
  }

  return new Response("OK", { status: 200 });
}
