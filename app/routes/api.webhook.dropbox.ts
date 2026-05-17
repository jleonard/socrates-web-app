import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";

//
// Dropbox webhook verification
//
export async function loader({ request }: LoaderFunctionArgs) {
  console.log("Dropbox challenge loader hit");
  const url = new URL(request.url);

  const challenge = url.searchParams.get("challenge");

  if (!challenge) {
    return new Response("Missing challenge", {
      status: 400,
    });
  }

  return new Response(challenge, {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
    },
  });
}

//
// Dropbox webhook events
//
export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json();

  console.log("Dropbox webhook event:", body);

  // TODO:
  // trigger list_folder/continue sync

  return new Response("OK", {
    status: 200,
  });
}
