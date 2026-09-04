import { data, type LoaderFunctionArgs } from "react-router";
import { getSessionId, sessionStorage } from "~/sessions.server";
import type { LocationRow } from "~/types";
import { getSupabaseServerClient } from "~/utils/supabase.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers: supabaseHeaders } =
    getSupabaseServerClient(request);

  const { session, sessionId } = await getSessionId(request);

  const buildHeaders = async () => {
    const headers = new Headers(supabaseHeaders);
    headers.append("Set-Cookie", await sessionStorage.commitSession(session));
    return headers;
  };

  // TODO - if we have a location: use it.

  const viewState = { longitude: -73.935242, latitude: 40.73061, zoom: 11 };

  const { data: locations, error } = await supabase
    .from("locations")
    .select()
    .limit(200)
    .returns<LocationRow[]>();

  return data(
    {
      pageTitle: "WonderWay",
      mapboxToken: process.env.MAPBOX_TOKEN,
      viewState,
      locations,
    },
    {
      headers: await buildHeaders(),
      /*
      headers: {
        "Set-Cookie": await sessionStorage.commitSession(session),
      },
      */
    },
  );
}
