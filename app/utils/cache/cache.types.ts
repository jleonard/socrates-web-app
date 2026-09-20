/**

* The two possible cache scopes.
*
* `location`:
* The answer is only reusable when the visitor is at the
* same location.
*
* `global`:
* The answer can be reused regardless of location.
  */
export type CacheScope = "location" | "global";

/**

* Information about the context in which a question was asked.
*
* A location can currently represent either an institution or
* an exhibition. We intentionally don't distinguish between
* those here; `locationId` is simply the contextual boundary
* for the cache.
  */
export interface CacheContext {
  locationId: string;
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
* cacheable: true,
* scope: "location"
* }
*
* means the answer is useful enough to cache, but should only
* be reused at the same location.
  */
export interface CacheDecision {
  cacheable: boolean;
  scope: CacheScope;
}
