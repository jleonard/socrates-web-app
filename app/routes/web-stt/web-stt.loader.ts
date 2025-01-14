import { json, type LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ context, request }: LoaderFunctionArgs) {
  return json({
    pageTitle: "Chat",
  });
}
