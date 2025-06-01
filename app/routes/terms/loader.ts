import { redirect, type LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ context, request }: LoaderFunctionArgs) {
  return Response.json({
    pageTitle: "ayapi | terms and conditions",
  });
}
