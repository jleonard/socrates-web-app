import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";

// GET /api/calls?page=1&pageSize=20
//
// Returns rows from the "calls" table, newest first (created_at desc),
// paginated with page/pageSize query params.
//
// Response shape:
// {
//   rows: Row[],
//   page: number,
//   pageSize: number,
//   totalCount: number,
//   totalPages: number,
//   hasMore: boolean
// }

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function loader({ request }: LoaderFunctionArgs) {
  const apiKey = request.headers.get("x-api-key");

  if (!apiKey || apiKey !== process.env.WW_ADMIN_API_KEY) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase } = getSupabaseServiceRoleClient();

  const url = new URL(request.url);

  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE),
  );

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("elevenlabs_history")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  const { data: rows, error, count } = await query;

  if (error) {
    throw data({ error: error.message }, { status: 500 });
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    rows,
    page,
    pageSize,
    totalCount,
    totalPages,
    hasMore: page < totalPages,
  };
}
