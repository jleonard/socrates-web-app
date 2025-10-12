import type { MetaFunction } from "@remix-run/node";

import type { loader } from "./loader";

export { loader } from "./loader";
export { default } from "./view";
export { action } from "./action";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [{ title: data?.pageTitle }];
};
