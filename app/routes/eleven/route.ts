import type { MetaFunction } from "@remix-run/node";

import type { loader } from "./eleven.loader";

export { loader } from "./eleven.loader";
export { default } from "./view";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [{ title: data?.pageTitle }];
};
