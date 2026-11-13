import type { MetaFunction } from "react-router";

export { loader } from "./loader";
export { default } from "./view";

export const handle = { scrollable: true };

// the loader only redirects (to /legal/privacy), so there's no loader data
export const meta: MetaFunction = () => [{ title: "WonderWay" }];
