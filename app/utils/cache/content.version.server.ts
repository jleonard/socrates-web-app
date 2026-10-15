import { getRedis } from "~/utils/redis.server";

/**
 * Content versions retire cached answers when a location's content changes.
 *
 * Each location id (exhibition or place) has a counter at
 * `cache_version:<id>`. The ingest routes bump it whenever content for that
 * location changes; cached answers record the versions they were created
 * under, and lookups only match the current versions. Old entries are never
 * deleted, just unreachable, and expire through their TTL.
 *
 * A missing counter counts as 0, so nothing needs seeding.
 */
const KEY_PREFIX = "cache_version:";

/** Bumps the version of every given location id. Never throws. */
export async function bumpContentVersions(
  ids: (string | null | undefined)[],
): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  if (unique.length === 0) return;

  try {
    const redis = await getRedis();
    await Promise.all(unique.map((id) => redis.incr(`${KEY_PREFIX}${id}`)));
    console.log("[cache] bumped content versions", unique);
  } catch (err) {
    // A missed bump means stale cached answers could be served, so make it
    // loud, but never fail an ingest over it.
    console.error("[cache] bumpContentVersions failed", { unique, err });
  }
}

/**
 * Current versions for the given ids, combined into one tag-safe string
 * (e.g. "7x3"), in the order given. Throws on a Redis error so callers can
 * skip the cache rather than match against a wrong version.
 */
export async function getContentVersion(
  ids: (string | null | undefined)[],
): Promise<string> {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  if (unique.length === 0) return "0";

  const redis = await getRedis();
  const values = await redis.mGet(unique.map((id) => `${KEY_PREFIX}${id}`));
  return values.map((v) => Number(v ?? 0)).join("x");
}
