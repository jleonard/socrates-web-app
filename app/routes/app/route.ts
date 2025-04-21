import type { MetaFunction } from "@remix-run/node";

import type { loader } from "./app.loader";

export { loader } from "./app.loader";
export { default } from "./view";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [{ title: data?.pageTitle }];
};
