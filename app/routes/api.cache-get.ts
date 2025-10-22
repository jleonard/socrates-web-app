import { data, type LoaderFunctionArgs } from "react-router";
import { searchCache } from "~/utils/cache.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim();

  if (!query) {
    return data({ error: "query parameter is required" }, { status: 400 });
  }

  const cached = await searchCache(query);
  console.log(cached);

  if (cached) {
    return { cached: true, output: cached.answer };
  } else {
    return { cached: false };
  }
}
