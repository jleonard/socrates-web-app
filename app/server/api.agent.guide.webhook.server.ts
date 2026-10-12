import * as Sentry from "@sentry/react-router";
import type { ActionFunction } from "react-router";
import { handleLegacyWebhook } from "./api.agent.webhook.legacy.server";
import { getChatHistory } from "./guide/chat.history.server";
import { resolveLocation } from "./guide/location.server";
import { correctPronunciations } from "./guide/pronunciation.server";
import { buildSearchQuery } from "./guide/search.query.server";

/** Places still served by the legacy webhook until they migrate. */
const LEGACY_PLACES = new Set(["mit", "wonderway"]);

export const handleGuideWebhook: ActionFunction = async (args) => {
  const { request } = args;
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // The legacy handler reads the body itself, so keep an unread copy.
  const legacyRequest = request.clone();

  try {
    /*
     * 📦 args posted by the ElevenLabs tool.
     * `query` is filled in by the ElevenLabs agent; the rest come from the
     * dynamic variables set in app/routes/app/view.tsx at session start.
     */
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    const { query, user_id, place, conversation_id } = body ?? {};

    // setup logging
    const startMs = Date.now();
    let loggingDetails: Record<string, any> = {
      user_id,
      conversation_id,
      query: {
        original: query,
      },
      location: {},
      timing: {
        start: new Date(startMs).toISOString(),
      },
    };

    /*
     * 📦 temp route to the legacy webhook until MIT migrates.
     */
    if (LEGACY_PLACES.has(place)) {
      console.log("[guide] using legacy webhook", { conversation_id, place });
      return await handleLegacyWebhook({ ...args, request: legacyRequest });
    }

    const coords = parseCoords(body?.user_lat, body?.user_long);

    loggingDetails.location.coords = coords;

    if (typeof query !== "string" || !query.trim()) {
      return new Response("Missing query", { status: 400 });
    }
    if (typeof place !== "string" || !place.trim()) {
      return new Response("Missing place", { status: 400 });
    }

    console.log("[guide] args", {
      conversation_id,
      query,
      user_id,
      place,
      coords,
    });

    /*
     * 📍 resolve the posted place into its place and exhibition ids
     */
    const locationContext = await resolveLocation(place);
    loggingDetails.location = { ...loggingDetails.location, ...locationContext };

    /*
     * ✏️ fix speech-to-text mishearings. Exhibition entries win over place
     * entries when both define the same alias.
     */
    const correctedQuery = await correctPronunciations(
      [locationContext.exhibitionId, locationContext.placeId],
      query,
    );
    const visitorQuery = correctedQuery ?? query;
    loggingDetails.query.corrected = correctedQuery;

    if (correctedQuery) {
      console.log("[guide] pronunciation corrected", {
        conversation_id,
        original: query,
        corrected: correctedQuery,
      });
    }

    /*
     * 🔎 build the search query: English, cleaned up for retrieval, with
     * follow-ups resolved from recent history. Used ONLY for retrieval;
     * the answering model gets `visitorQuery`.
     */
    const chatHistory = await getChatHistory(user_id);
    const searchStartMs = Date.now();
    const { searchQuery, fallback: searchQueryFallback } =
      await buildSearchQuery(visitorQuery, chatHistory);
    loggingDetails.query.search = searchQuery;
    loggingDetails.query.search_fallback = searchQueryFallback;
    loggingDetails.timing.search_query_ms = Date.now() - searchStartMs;

    console.log("[guide] search query", {
      conversation_id,
      visitor: visitorQuery,
      search: searchQuery,
      fallback: searchQueryFallback,
    });
  } catch (err) {
    console.error("agent webhook error:", err);
    Sentry.captureException(err);
    return new Response("Internal server error", { status: 500 });
  }

  return new Response("Not implemented", { status: 501 });
};

/**
 * The client sends 0,0 when it has no location (view.tsx falls back to 0),
 * and dynamic variables may arrive as strings. Treat both cases as
 * "no coords" rather than a real position.
 */
function parseCoords(
  lat: unknown,
  long: unknown,
): { lat: number; long: number } | null {
  const la = Number(lat);
  const lo = Number(long);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la === 0 && lo === 0) return null;
  return { lat: la, long: lo };
}
