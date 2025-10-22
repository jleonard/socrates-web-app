import { data, type ActionFunctionArgs } from "react-router";
import { storeCache } from "~/utils/cache.server";

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer : "";
  const tool = typeof body.tool === "string" ? body.tool : "ragmet";

  console.log("input :: ", body.answer, answer);

  const ttlSeconds =
    typeof body.ttlSeconds === "number" ? body.ttlSeconds : undefined;

  if (!query || !answer) {
    return data({ error: "query and answer are required" }, { status: 400 });
  }

  await storeCache(query, answer, tool, ttlSeconds);

  return { success: true };
}
