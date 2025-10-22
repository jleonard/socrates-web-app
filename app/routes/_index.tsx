import { LoaderFunction, redirect } from "react-router";
import type { MetaFunction } from "react-router";

// Redirect to /app on page load
export const loader: LoaderFunction = async () => {
  return redirect("/app");
};

// Optional: meta still useful for crawlers, previews, etc.
export const meta: MetaFunction = () => {
  return [
    { title: "ayapi" },
    { name: "description", content: "Welcome to Ayapi!" },
  ];
};

// This won’t render anything since we redirect in the loader
export default function Index() {
  return null;
}
