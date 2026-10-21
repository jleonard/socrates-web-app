import * as Sentry from "@sentry/react-router";
import type { ActionFunction } from "react-router";
import { handleLegacyWebhook } from "./api.agent.webhook.legacy.server";
import { streamAnswer } from "./guide/answer.server";
import {
  GUIDE_CACHE_MODE,
  lookupGuideCache,
  maybeStoreGuideCache,
} from "./guide/cache.server";
import { saveTurn } from "./guide/save.turn.server";
import { getChatHistory } from "./guide/chat.history.server";
import { resolveLocation } from "./guide/location.server";
import { buildAnswerPrompt } from "./guide/prompt.server";
import { correctPronunciations } from "./guide/pronunciation.server";
import { retrieveChunks } from "./guide/retrieval.server";
import { buildSearchQuery } from "./guide/search.query.server";
import { getVenueContext } from "./guide/venue.context.server";

/** Places still served by the legacy webhook until they migrate. */
const LEGACY_PLACES = new Set(["mit", "wonderway"]);

const TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

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
    // set by the ElevenLabs agent on each call; null if missing or malformed
    const language = parseLanguage(body?.language);

    // setup logging
    const startMs = Date.now();
    let loggingDetails: Record<string, any> = {
      // links the event_log row to the full agent_history record
      request_id: crypto.randomUUID(),
      user_id,
      conversation_id,
      language,
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
    loggingDetails.location = {
      ...loggingDetails.location,
      ...locationContext,
    };

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
    // venue context isn't needed until the answer, but both are Redis reads
    const [chatHistory, venueContext] = await Promise.all([
      getChatHistory(user_id),
      getVenueContext(locationContext),
    ]);
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

    /*
     * ⚡ cache, keyed on the English search query at this location and
     * content version. In shadow mode we only log what would be served.
     */
    const cache =
      GUIDE_CACHE_MODE !== "off" && !searchQueryFallback
        ? await lookupGuideCache({
            searchQuery,
            location: locationContext,
            language,
          })
        : null;
    loggingDetails.cache = {
      mode: GUIDE_CACHE_MODE,
      version: cache?.version ?? null,
      best_question: cache?.best?.question ?? null,
      best_similarity: cache?.best?.similarity ?? null,
      would_hit: Boolean(cache?.hit),
    };

    if (cache?.hit && GUIDE_CACHE_MODE === "serve") {
      const reply = cache.hit.answer;
      loggingDetails.answer = { mode: "cache", reply };
      loggingDetails.timing.total_ms = Date.now() - startMs;

      // Small writes, so wait for them before responding: on Vercel, work
      // left running after the response may never finish.
      await saveTurn({
        userId: user_id,
        conversationId: conversation_id,
        history: chatHistory,
        visitorQuery,
        reply,
        source: "cache",
        responseTimeMs: Date.now() - startMs,
        loggingDetails,
      });
      return new Response(reply, { headers: TEXT_HEADERS });
    }

    /*
     * 🌲 retrieval: "here" scope (this exhibition + place-level content),
     * general + visual-description searches, reranked together.
     */
    const retrieval = await retrieveChunks({
      searchQuery,
      location: locationContext,
    });
    loggingDetails.retrieval = {
      filter: retrieval.filter,
      elsewhere_filter: retrieval.elsewhereFilter,
      counts: retrieval.counts,
      rerank_failed: retrieval.rerankFailed,
      rerank_error: retrieval.rerankError,
      // every candidate's scores, for RERANK_MIN calibration (text omitted)
      candidates: retrieval.candidates.map((c) => ({
        id: c.id,
        object_id: c.metadata.object_id ?? null,
        chunk_type: c.metadata.chunk_type ?? null,
        pool: c.pool,
        searches: c.searches,
        dense: c.dense,
        rerank: c.rerank,
        selected: retrieval.chunks.includes(c),
        pass: c.pass,
      })),
    };
    Object.assign(loggingDetails.timing, retrieval.timings);

    console.log("[guide] retrieval", {
      conversation_id,
      counts: retrieval.counts,
      rerank_failed: retrieval.rerankFailed,
      selected: retrieval.chunks.map((c) => ({
        id: c.id,
        object_id: c.metadata.object_id,
        pool: c.pool,
        searches: c.searches,
        rerank: c.rerank,
        pass: c.pass,
      })),
    });

    /*
     * ✏️ build the answer prompt: system rules, SOURCES (venue context +
     * chunks grouped by exhibition / object / background), or the
     * no-sources instruction, then history and the visitor's own words.
     */
    const answerPrompt = buildAnswerPrompt({
      visitorQuery,
      language,
      history: chatHistory,
      chunks: retrieval.chunks,
      venueContext,
      location: locationContext,
    });
    loggingDetails.answer = {
      mode: answerPrompt.mode,
      venue_context: venueContext.length,
      sections: answerPrompt.sections,
    };

    /*
     * 🤖 stream the answer. Errors inside the stream are logged and end the
     * stream; the HTTP status is already 200 by then.
     */
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let reply = "";
        try {
          for await (const text of streamAnswer(answerPrompt.messages)) {
            loggingDetails.timing.first_token_ms ??= Date.now() - startMs;
            reply += text;
            // Response bodies must be bytes, not strings
            controller.enqueue(encoder.encode(text));
          }
          reply = reply.trim();
          loggingDetails.answer.reply = reply;
          loggingDetails.timing.total_ms = Date.now() - startMs;

          // Save before closing: on Vercel, work left running after the
          // response ends may never finish. These writes are small.
          await saveTurn({
            userId: user_id,
            conversationId: conversation_id,
            history: chatHistory,
            visitorQuery,
            reply,
            source: answerPrompt.mode,
            responseTimeMs: loggingDetails.timing.total_ms,
            loggingDetails,
          });
          controller.close();
        } catch (err) {
          console.error("[guide] answer stream failed", err);
          Sentry.captureException(err);
          loggingDetails.answer.error =
            err instanceof Error ? err.message : String(err);
          controller.error(err);
          return;
        }

        // Best effort, after the response: the cache decision model takes a
        // second or two. If the function is frozen first, we only lose a
        // cache entry.
        void maybeStoreGuideCache({
          searchQuery,
          language,
          answer: reply,
          location: locationContext,
          version: cache?.version ?? null,
          mode: answerPrompt.mode,
          searchQueryFallback,
          rerankFailed: retrieval.rerankFailed,
        }).then((r) => console.log("[guide] cache store", r));
      },
    });

    return new Response(stream, { headers: TEXT_HEADERS });
  } catch (err) {
    console.error("agent webhook error:", err);
    Sentry.captureException(err);
    return new Response("Internal server error", { status: 500 });
  }
};

/**
 * The visitor's language as a two-letter ISO 639-1 code ("en", "es"…), as
 * set by the ElevenLabs agent. Anything else is treated as unknown (null):
 * the answer then follows the language of the question, and the cache is
 * skipped.
 */
function parseLanguage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return /^[a-z]{2}$/.test(code) ? code : null;
}

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
