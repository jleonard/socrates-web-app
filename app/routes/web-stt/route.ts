import type { MetaFunction } from "@remix-run/node";

import type { loader } from "./web-stt.loader";

export { default } from "./web-stt";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [{ title: data?.pageTitle }];
};
