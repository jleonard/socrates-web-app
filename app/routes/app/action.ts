import { ActionFunctionArgs } from "@remix-run/node";

export async function action({ request }: ActionFunctionArgs) {
  const { setAccessExpiration } = await import(
    "~/server/access.manager.server"
  );

  const body = await request.formData();

  const accessId = body.get("access_id");

  if (!accessId) {
    throw new Response("Missing access_id", { status: 400 });
  }

  const { data, error } = await setAccessExpiration(String(accessId), request);

  // todo sentry
  if (error) {
    console.error("Error updating expiration:", error);
    throw new Response("Failed to update expiration", { status: 500 });
  }

  return new Response("Expiration updated", { status: 200 });
}
