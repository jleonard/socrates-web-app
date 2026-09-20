import { data, type ActionFunctionArgs } from "react-router";
import { determineCacheDecision } from "~/utils/cache/cache-decision";
import { storeCache } from "~/utils/cache/cache.server";

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer : "";
  const placeId = typeof body.placeId === "string" ? body.placeId.trim() : "";

  console.log("api.cache-set input :: ", body.answer, answer);

  if (!query || !answer || !placeId) {
    return data(
      { error: "query, answer, and placeId are required" },
      { status: 400 },
    );
  }

  await cacheResponse({
    question: query,
    answer,
    placeId,
  });

  return { success: true };
}

async function cacheResponse({
  question,
  answer,
  placeId,
}: {
  question: string;
  answer: string;
  placeId: string;
}) {
  try {
    const decision = await determineCacheDecision(question, answer);

    console.log(
      "cacheResponse: decision",
      decision,
      "question:",
      question,
      "answer:",
      answer,
    );

    if (!decision.cacheable) {
      return;
    }

    await storeCache(
      question,
      answer,
      {
        placeId,
      },
      decision,
    );
  } catch (error) {
    console.error("Failed to cache response:", error);
  }
}
