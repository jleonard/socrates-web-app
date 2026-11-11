import { ActionFunctionArgs } from "react-router";
import * as Sentry from "@sentry/react-router";
import { setAccessExpiration } from "~/server/access.manager.server";
import { markGreeted } from "~/server/greeting.server";
import { getSessionId } from "~/sessions.server";

export async function action({ request }: ActionFunctionArgs) {
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
   * record that the user heard this place's greeting
   */
  if (intent === "greeted" && userId) {
    const { session } = await getSessionId(request);
    const place = session.get("place");
    try {
      await markGreeted(String(userId), place);
    } catch (error) {
      Sentry.captureException(error, {
        extra: { user_id: String(userId), place },
      });
    }
    return new Response("User greeted", { status: 200 });
  }

  return new Response("OK", { status: 200 });
}
