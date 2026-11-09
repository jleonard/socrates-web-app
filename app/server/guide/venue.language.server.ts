import { getRedis } from "~/utils/redis.server";
import { resolveLocation, type LocationContext } from "./location.server";

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
  return (await storedLanguage(location.placeId)) ?? DEFAULT_LANGUAGE;
}

/**
 * Same lookup from the raw `place` value the app has (an exhibition or a
 * place id), for the /app loader. Returns null when the place has no
 * language set, so callers can leave the agent on its own default.
 *
 * Never throws.
 */
export async function getPlaceLanguage(
  place: string | null | undefined,
): Promise<string | null> {
  if (!place) return null;
  try {
    const location = await resolveLocation(place);
    return await storedLanguage(location.placeId);
  } catch (err) {
    console.error("[guide] getPlaceLanguage failed", { place, err });
    return null;
  }
}

/** The stored language for a place, or null if unset, invalid or on error. */
async function storedLanguage(placeId: string): Promise<string | null> {
  try {
    const redis = await getRedis();
    const value = await redis.get(`language:${placeId}`);
    const code = typeof value === "string" ? value.trim().toLowerCase() : "";
    return /^[a-z]{2}$/.test(code) ? code : null;
  } catch (err) {
    console.error("[guide] reading the venue language failed", {
      placeId,
      err,
    });
    return null;
  }
}
