import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { searchCache } from "~/utils/cache.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim();

  if (!query) {
    return json({ error: "query parameter is required" }, { status: 400 });
  }

  const cached = await searchCache(query);

  if (cached) {
    return json(cached.answer);
  } else {
    return json({ cached: false });
  }
}
