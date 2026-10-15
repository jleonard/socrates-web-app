import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";

export type LocationContext = {
  /** The id posted by the client (`place`): an exhibition or a place. */
  locationId: string;
  /** The place (venue) the location belongs to, e.g. "amnh-nyc". */
  placeId: string;
  /** Set when locationId is an exhibition, e.g. "amnh-hall-of-advanced-mammals". */
  exhibitionId?: string;
};

/**
 * Resolves the posted location id into its place and, if it is an
 * exhibition, its exhibition id, using `location_relationships`
 * (written by api.strapi.webhook.ts when an exhibition is saved).
 *
 * Same logic as resolveLocationId in api.agent.webhook.server.ts.
 * Throws on a database error: guessing would scope retrieval to the
 * wrong content, which is worse than failing the request.
 */
export async function resolveLocation(
  locationId: string,
): Promise<LocationContext> {
  const { supabase } = getSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("location_relationships")
    .select("child_id, parent_id, child_type, parent_type")
    .eq("child_id", locationId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `resolveLocation failed for ${locationId}: ${error.message}`,
    );
  }

  // A child row means locationId sits under a parent place.
  if (data?.parent_id) {
    return {
      locationId,
      placeId: data.parent_id,
      exhibitionId: data.child_type === "exhibition" ? locationId : undefined,
    };
  }

  // No parent means this is already the place.
  return { locationId, placeId: locationId };
}
