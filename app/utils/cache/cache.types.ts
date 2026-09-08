/**
 * The two possible cache scopes.
 *
 * `place`:
 *   The answer is only reusable when the visitor is at the
 *   same place.
 *
 * `global`:
 *   The answer can be reused regardless of place.
 */
export type CacheScope = "place" | "global";

/**
 * Information about the context in which a question was asked.
 *
 * A place can currently represent either an institution or an
 * exhibition. We intentionally don't distinguish between those
 * yet; `placeId` is simply the contextual boundary for the cache.
 */
export interface CacheContext {
  placeId: string;
}

/**
 * Result of the application's cacheability decision.
 *
 * This decision should be made by the agent/application before
 * calling `storeCache()`.
 *
 * Example:
 *
 * {
 *   cacheable: true,
 *   scope: "place"
 * }
 *
 * means the answer is useful enough to cache, but should only
 * be reused at the same place.
 */
export interface CacheDecision {
  cacheable: boolean;
  scope: CacheScope;
}
