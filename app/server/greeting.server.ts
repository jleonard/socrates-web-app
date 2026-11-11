import { getRedis } from "~/utils/redis.server";

/** A visitor hears a place's greeting again after this long. */
const GREETING_TTL_SECONDS = 48 * 60 * 60;

/** Places without a `place` param share the default Wonderway greeting. */
const DEFAULT_GREETING_PLACE = "wonderway";

/**
 * `greeted:<user_id>:<place>`: one key per greeting, so a visitor greeted at
 * one venue (or exhibition) is still greeted at the next one. `place` is the
 * raw id from the session (exhibition or place), the same id the greeting
 * mp3 is named after.
 */
function greetedKey(userId: string, place: string | null | undefined) {
  return `greeted:${userId}:${place || DEFAULT_GREETING_PLACE}`;
}

/**
 * Whether the visitor heard this place's greeting in the last 48 hours.
 * Never throws: on a Redis error it answers false (greet again), which beats
 * silently skipping a first-time visitor's greeting.
 */
export async function hasBeenGreeted(
  userId: string,
  place: string | null | undefined,
): Promise<boolean> {
  try {
    const redis = await getRedis();
    return (await redis.exists(greetedKey(userId, place))) === 1;
  } catch (err) {
    console.error("[greeting] reading greeted flag failed", { place, err });
    return false;
  }
}

/** Records that the visitor heard this place's greeting (expires in 48 hours). */
export async function markGreeted(
  userId: string,
  place: string | null | undefined,
): Promise<void> {
  const redis = await getRedis();
  await redis.set(greetedKey(userId, place), new Date().toISOString(), {
    EX: GREETING_TTL_SECONDS,
  });
}
