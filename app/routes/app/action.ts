import { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  const { setAccessExpiration } = await import(
    "~/server/access.manager.server"
  );

  const body = await request.formData();

  const intent = body.get("intent");
  const accessId = body.get("access_id");

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

  if (intent === "check-expiration") {
    console.log("action check expiration");
    return new Response("Expiration check", { status: 200 });
  }

  return new Response("OK", { status: 200 });
}
