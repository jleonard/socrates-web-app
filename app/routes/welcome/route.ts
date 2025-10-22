import type { MetaFunction } from "react-router";

import type { loader } from "./loader";

export { loader } from "./loader";
export { default } from "./view";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [{ title: data?.pageTitle }];
};
