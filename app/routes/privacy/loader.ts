import { type LoaderFunctionArgs } from "react-router";

export async function loader({ context, request }: LoaderFunctionArgs) {
  return {
    pageTitle: "WonderWay | Privacy Policy",
  };
}
