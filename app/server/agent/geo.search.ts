import { getRedis } from "~/utils/redis.server";

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
