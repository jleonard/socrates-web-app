import { getRedis } from "~/utils/redis.server";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";

export async function resolveNearbyItems(
  groupId: string,
  lat: number,
  lng: number,
  radiusMeters = 2,
): Promise<string[]> {
  const { supabase: subabaseServiceRole } = getSupabaseServiceRoleClient();

  const { data, error } = await subabaseServiceRole.rpc("find_nearby_content", {
    p_group_id: groupId,
    p_latitude: lat,
    p_longitude: lng,
    p_radius_meters: radiusMeters,
  });

  if (error) {
    throw new Error(`resolveNearbyItems failed: ${error.message}`);
  }

  return (data ?? []).map((row) => row.object_id);
}

/* @deprecated. not using redis. moved on to a supabase table with a geo Point column and an rpc function.  */
export async function resolveNearbyArtworks(
  placeId: string,
  lat: number,
  lng: number,
  radiusMeters = 15,
): Promise<string[]> {
  const redis = await getRedis();

  const results = (await redis.geosearch(
    `place:geo:${placeId}`,
    "FROMLONLAT",
    lng,
    lat,
    "BYRADIUS",
    radiusMeters,
    "m",
  )) as string[];

  // strip the type prefix, keep only artwork ids
  return results
    .filter((id) => id.startsWith("artwork:"))
    .map((id) => id.replace("artwork:", ""));
}

/* @deprecated. not using redis. moved on to a supabase table with a geo Point column and an rpc function.  */
export async function resolveNearbyArtifacts(
  placeId: string,
  lat: number,
  lng: number,
  radiusMeters = 15,
): Promise<string[]> {
  const redis = await getRedis();

  const results = (await redis.geosearch(
    `place:geo:${placeId}`,
    "FROMLONLAT",
    lng,
    lat,
    "BYRADIUS",
    radiusMeters,
    "m",
  )) as string[];

  return results
    .filter((id) => id.startsWith("artifact:"))
    .map((id) => id.replace("artifact:", ""));
}
