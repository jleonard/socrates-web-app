import type { MetaFunction } from "react-router";

import type { loader } from "./loader";

export { loader } from "./loader";
export { default } from "./view";

export const handle = { scrollable: true };

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => {
  return [{ title: loaderData?.pageTitle }];
};
