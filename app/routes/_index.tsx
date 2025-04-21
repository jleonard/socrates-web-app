import { LoaderFunction, redirect } from "@remix-run/node";
import type { MetaFunction } from "@remix-run/node";

// Redirect to /app on page load
export const loader: LoaderFunction = async () => {
  return redirect("/app");
};

// Optional: meta still useful for crawlers, previews, etc.
export const meta: MetaFunction = () => {
  return [
    { title: "Ayapi" },
    { name: "description", content: "Welcome to Ayapi!" },
  ];
};

// This won’t render anything since we redirect in the loader
export default function Index() {
  return null;
}
