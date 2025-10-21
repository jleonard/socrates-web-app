import { ActionFunctionArgs, data } from "@remix-run/node";

const GOOGLE_API_KEY = process.env.GOOGLE_PLACE_API_KEY;

// Tipos de lugares culturalmente relevantes
const CULTURAL_TYPES = [
  "museum",
  "art_gallery",
  "tourist_attraction",
  "church",
  "synagogue",
  "mosque",
  "temple",
  "library",
  "theater",
  "amusement_park",
  "park",
];

// Tipos que podrían ser barrios
const NEIGHBORHOOD_TYPES = ["locality", "sublocality", "sublocality_level_1"];

// Tipos de ciudad
const CITY_TYPES = ["locality", "administrative_area_level_1", "country"];

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    if (!GOOGLE_API_KEY) {
      return data(
        { error: "Google Places API key not configured" },
        { status: 500 }
      );
    }

    const { lat, lng } = await request.json();

    if (!lat || !lng) {
      return data(
        { error: "Latitude and longitude are required" },
        { status: 400 }
      );
    }

    // 1. Primero, obtener información de geocoding
    const geocodingUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_API_KEY}`;
    const geocodingResponse = await fetch(geocodingUrl);
    const geocodingData = await geocodingResponse.json();

    if (geocodingData.status !== "OK") {
      throw new Error("Geocoding failed");
    }

    // 2. Buscar lugares cercanos culturalmente relevantes
    const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=500&type=establishment&key=${GOOGLE_API_KEY}`;
    const placesResponse = await fetch(placesUrl);
    const placesData = await placesResponse.json();

    let placeInfo = null;

    // 3. Priorizar lugares culturales
    if (placesData.results && placesData.results.length > 0) {
      for (const place of placesData.results) {
        if (
          place.types &&
          CULTURAL_TYPES.some((type) => place.types.includes(type))
        ) {
          placeInfo = {
            name: place.name,
            type: "cultural" as const,
          };
          break;
        }
      }
    }

    // 4. Si no hay lugar cultural, buscar barrio
    if (!placeInfo && geocodingData.results) {
      for (const result of geocodingData.results) {
        for (const component of result.address_components) {
          if (
            component.types &&
            NEIGHBORHOOD_TYPES.some((type) => component.types.includes(type))
          ) {
            placeInfo = {
              name: component.long_name,
              type: "neighborhood" as const,
            };
            break;
          }
        }
        if (placeInfo) break;
      }
    }

    // 5. Si no hay barrio, usar ciudad
    if (!placeInfo && geocodingData.results) {
      for (const result of geocodingData.results) {
        for (const component of result.address_components) {
          if (
            component.types &&
            CITY_TYPES.some((type) => component.types.includes(type))
          ) {
            placeInfo = {
              name: component.long_name,
              type: "city" as const,
            };
            break;
          }
        }
        if (placeInfo) break;
      }
    }

    return { placeInfo };
  } catch (error) {
    return data({ error: "Internal server error" }, { status: 500 });
  }
}
