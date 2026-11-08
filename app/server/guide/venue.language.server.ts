import { getRedis } from "~/utils/redis.server";
import type { LocationContext } from "./location.server";

const DEFAULT_LANGUAGE = "en";

/**
 * The language the venue's content is written in (ISO 639-1), from the
 * Strapi Place `language` field (`language:<place_id>` in Redis, written by
 * api.strapi.webhook.ts). The search query is written in this language so it
 * matches the content; the visitor can speak anything.
 *
 * Never throws: unset, invalid or a Redis error all mean English.
 */
export async function getContentLanguage(
  location: LocationContext,
): Promise<string> {
  try {
    const redis = await getRedis();
    const value = await redis.get(`language:${location.placeId}`);
    const code = typeof value === "string" ? value.trim().toLowerCase() : "";
    return /^[a-z]{2}$/.test(code) ? code : DEFAULT_LANGUAGE;
  } catch (err) {
    console.error("[guide] getContentLanguage failed", {
      placeId: location.placeId,
      err,
    });
    return DEFAULT_LANGUAGE;
  }
}
