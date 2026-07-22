import { redirect, type LoaderFunctionArgs } from "react-router";

export async function loader({ context, request }: LoaderFunctionArgs) {
  return {
    pageTitle: "WonderWay | Terms and Conditions",
  };
}
