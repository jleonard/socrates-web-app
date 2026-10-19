import { data, type LoaderFunctionArgs } from "react-router";
import { getSessionId, sessionStorage } from "~/sessions.server";
import type { MapLocation } from "~/types";
import { getSupabaseServerClient } from "~/utils/supabase.server";

type MapLocationQueryRow = Omit<MapLocation, "rank"> & {
  prominence: number | null;
  prominence_override: number | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers: supabaseHeaders } =
    getSupabaseServerClient(request);

  const { session } = await getSessionId(request);

  const buildHeaders = async () => {
    const headers = new Headers(supabaseHeaders);
    headers.append("Set-Cookie", await sessionStorage.commitSession(session));
    return headers;
  };

  // Fallback center. The view starts at the user's last known location when
  // the browser has one and shows their live position via GeolocateControl.
  const viewState = { longitude: -73.935242, latitude: 40.73061, zoom: 11 };

  // All rows for now; the client filters by zoom (see utils/map/prominence).
  // Once there are several cities, load by viewport + minProminenceForZoom.
  const { data: rows, error } = await supabase
    .from("map_locations")
    .select(
      "id,place_id,name,category,description,image_url,lat,lng,prominence,prominence_override",
    )
    .order("prominence", { ascending: false, nullsFirst: false })
    .limit(5000)
    .returns<MapLocationQueryRow[]>();

  if (error) {
    console.error("map loader: map_locations query failed", error);
  }

  const locations: MapLocation[] = (rows ?? []).map(
    ({ prominence, prominence_override, ...row }) => ({
      ...row,
      rank: prominence_override ?? prominence ?? 0,
    }),
  );

  return data(
    {
      pageTitle: "WonderWay",
      mapboxToken: process.env.MAPBOX_TOKEN,
      viewState,
      locations,
    },
    { headers: await buildHeaders() },
  );
}
