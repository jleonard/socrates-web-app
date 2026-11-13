import { data, type LoaderFunctionArgs } from "react-router";
import { searchCache } from "~/utils/cache/cache.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim();
  const placeId = url.searchParams.get("placeId")?.trim();

  if (!query) {
    return data({ error: "query parameter is required" }, { status: 400 });
  }
  if (!placeId) {
    return data({ error: "placeId parameter is required" }, { status: 400 });
  }

  // CacheContext is keyed by locationId now; this route keeps its public
  // `placeId` parameter. Passing { placeId } searched an undefined location.
  const cached = await searchCache(query, { locationId: placeId });
  console.log(cached);

  if (cached) {
    return { cached: true, output: cached.answer };
  } else {
    return { cached: false };
  }
}
