import { redirect, type LoaderFunctionArgs } from "react-router";

export async function loader({ context, request }: LoaderFunctionArgs) {
  return Response.json({
    pageTitle: "WonderWay | terms and conditions",
  });
}
