import { getRedis } from "~/utils/redis.server";
import type { LocationContext } from "./location.server";

/**
 * Loads the CMS prompts for the visitor's location (`prompt:<id>` in Redis,
 * written by api.strapi.webhook.ts), most specific first: exhibition, then
 * place.
 *
 * These are venue content ("The user is in the Hall of Advanced Mammals…"),
 * so the answer prompt presents them as a source under ABOUT THIS
 * EXHIBITION, not as instructions. The old webhook appended them to the
 * system prompt, where the model didn't treat them as a source and refused
 * "where am I?" even with the answer in context.
 *
 * Never throws: on a Redis error it returns [] and the answer proceeds
 * without venue context.
 */
export async function getVenueContext(
  location: LocationContext,
): Promise<string[]> {
  const ids = [...new Set([location.exhibitionId, location.placeId])].filter(
    Boolean,
  ) as string[];
  if (ids.length === 0) return [];

  try {
    const redis = await getRedis();
    const values = await redis.mGet(ids.map((id) => `prompt:${id}`));
    return values
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
  } catch (err) {
    console.error("[guide] getVenueContext failed", { ids, err });
    return [];
  }
}
