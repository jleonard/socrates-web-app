import { Pinecone } from "@pinecone-database/pinecone";
import * as Sentry from "@sentry/react-router";
import { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import type { ActionFunction } from "react-router";
import { QUERY_TYPE_CONFIG } from "~/server/agent/agent.config";
import { AgentConfig, HistoryLog, ToolLog } from "~/types";
import { determineCacheDecision } from "~/utils/cache/cache-decision";
import { searchCache, storeCache } from "~/utils/cache/cache.server";
import { logAppEvent } from "~/utils/events/appEvents.server";
import { logAgentHistory } from "~/utils/history.server";
import { getQueryEmbedding } from "~/utils/pinecone";
import { getRedis } from "~/utils/redis.server";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";
import {
  accuracy,
  context,
  goals,
  guardrails,
  noRagFallbackMessage,
  role,
} from "~/utils/system.prompt";
import { resolveNearbyItems } from "./agent/geo.search";
import { correctMispronunciations } from "./agent/mispronounciations";
import { rewriteQuery } from "./agent/query.rewrite.server";
import { DENSE_FLOOR, RERANK_MIN, retrieve } from "./agent/rag.retrieve"; // recall -> rerank -> gate
import { handleLegacyWebhook } from "./api.agent.webhook.legacy.server";

let USE_LEGACY = false;

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });
const MAX_CHAT_MESSAGES = 10;
let PROMPT = `${role}\n\n${context}\n\n${goals}\n\n${accuracy}\n\n${guardrails}`;

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

/** Metadata keys that are useful for logging/ingest but just noise for the model. */
const RAG_METADATA_KEYS_TO_EXCLUDE = [
  "dropbox_file_id",
  "dropbox_path",
  "chunk_index",
  "chunk_count",
  "namespace",
  "ingest_instructions",
];

export const handleWebhook: ActionFunction = async (args) => {
  const { request } = args;
  const clonedRequest = request.clone();
  const redis = await getRedis();
  const { supabase } = getSupabaseServiceRoleClient();

  try {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = await request.json();

    /*
     * 📦 process body vars
     */
    const {
      query: postedQuery,
      user_id,
      place: locationId,
      user_lat,
      user_long,
    } = body;

    const locationContext = await resolveLocationId(locationId, supabase);
    const originalQuery = postedQuery;
    let query = postedQuery;

    /* 🔷 logging: prep the history log */
    const requestId = crypto.randomUUID();
    const timerStart = Date.now();
    const tools: ToolLog[] = [];

    /* 🔷 logging: log the query */
    logAppEvent({
      event_type: "agent_log",
      event_message: `posted query : ${query}`,
      event_details: {
        user_id,
        locationContext,
        coords: { lat: user_lat, long: user_long },
      },
    });

    /*
     * 📦 temp route to the legacy webhook until MIT migrates.
     */
    const useLegacy =
      USE_LEGACY ||
      locationContext.locationId === "mit" ||
      locationContext.locationId === "wonderway";
    if (useLegacy) {
      console.log(
        "using legacy webhook for location:",
        locationContext.locationId,
      );
      return await handleLegacyWebhook({ ...args, request: clonedRequest });
    }

    /*
     * ✏️ TODO fix correctMispronunciations at the exhibition and place level
     */
    let corrected;
    if (locationContext?.exhibitionId) {
      corrected = await correctMispronunciations(
        locationContext.exhibitionId,
        query,
      );
      if (corrected) {
        query = corrected;
      }
    }
    if (locationContext?.placeId) {
      corrected = await correctMispronunciations(
        locationContext.placeId,
        query,
      );
      if (corrected) {
        query = corrected;
      }
    }

    /*
     * ⚡ check semantic cache before doing expensive agent work
     */
    const cached = await searchCache(query, {
      locationId: locationContext?.locationId,
    });

    if (cached) {
      console.log(`[${requestId}] cache hit`, {
        question: query,
        cachedQuestion: cached.question,
        similarity: cached.similarity,
      });

      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(cached.answer);
            controller.close();
          },
        }),
        {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        },
      );
    }

    /*
     * ✏️ setup the messages array we'll send to the LLM
     */
    let messages = [];

    /*
     * ✏️ pull the prompt from redis or fallback
     */
    const redisPrompt = await redis.get(
      "prompt:" + locationContext?.locationId,
    );

    let prompt = PROMPT;
    if (redisPrompt) {
      prompt += "\n" + redisPrompt;
    }
    messages.push({ role: "system", content: prompt });
    console.log("debug: prompt ", prompt);

    /*
     * 💬 get the conversation history
     */
    const memoryKey = `chat:${user_id}`;
    const redisResponse = await redis.get(memoryKey);
    const chatHistory = redisResponse ? JSON.parse(redisResponse) : [];
    const trimmedHistory = chatHistory.slice(-MAX_CHAT_MESSAGES);
    messages.push(...trimmedHistory);
    console.log("debug: trimmedHistory ", trimmedHistory);

    /*
     * ✏️ rewrite + classify the query in one call.
     * `query` stays the visitor's words (used for the model, history, cache);
     * `searchQuery` is the clean English rewrite used ONLY for retrieval.
     */
    const {
      searchQuery,
      type: queryClassification,
      confidence: classificationConfidence,
      fallback: classificationFallback,
    } = await rewriteQuery(query, trimmedHistory);

    const agentConfig = QUERY_TYPE_CONFIG[queryClassification];

    // @TEMP
    console.log(`[${requestId}] agent request started`, {
      query: postedQuery,
      searchQuery,
      user_id,
      locationContext,
      coords: { lat: user_lat, long: user_long },
      classification: queryClassification,
    });

    /*
     * 🌲 retrieval prep: summary, embedding and filter are independent,
     * so run them in parallel.
     */
    const [conversationSummary, queryEmbedding, filter] = await Promise.all([
      getConversationSummary(redis, user_id, chatHistory),
      getQueryEmbedding(searchQuery), // rewritten query, not the raw one
      buildContextualPineconeFilter(
        agentConfig,
        locationContext,
        user_lat,
        user_long,
      ),
    ]);
    if (conversationSummary) {
      messages.push({
        role: "system",
        content: `Previous conversation summary: ${conversationSummary}`,
      });
    }
    console.log("debug: conversationSummary ", conversationSummary);

    /*
     * 🌲 retrieval: recall -> rerank -> gate (see rag.retrieve.ts).
     * A topK of 0 disables a namespace for this query type.
     */
    const useContextual = agentConfig.tools.includes("pinecone_contextual");
    const useGlobal = agentConfig.tools.includes("pinecone_global");
    const retrievalStart = Date.now();
    const {
      matches: allMatches,
      candidates,
      rerank,
      raw,
      rerankFailed,
    } = await retrieve({
      pc,
      embedding: queryEmbedding,
      searchQuery,
      filter,
      ctxTopK: useContextual ? agentConfig.contextualTopK : 0,
      globalTopK: useGlobal ? agentConfig.globalTopK : 0,
    });
    const retrievalMs = Date.now() - retrievalStart;

    console.log(`[${requestId}] retrieval`, {
      contextual_raw: raw.contextual.length,
      global_raw: raw.global.length,
      candidates,
      final: allMatches.length,
      rerankFailed,
      reranked: rerank,
    });

    /*
     * 🌲 inject retrieved context, or the no-context instruction
     */
    if (allMatches.length === 0) {
      messages.push({
        role: "system",
        content: noRagFallbackMessage,
      });
    } else {
      messages.push({
        role: "system",
        content: `RAG CONTEXT:\n${allMatches
          .map((m) => {
            if (!m.metadata) return null;

            const metadata = Object.fromEntries(
              Object.entries(m.metadata).filter(
                ([key]) => !RAG_METADATA_KEYS_TO_EXCLUDE.includes(key),
              ),
            );

            return JSON.stringify(metadata);
          })
          .filter(Boolean)
          .join("\n\n")}`,
      });
    }
    console.log("debug: allMatches filtered ", allMatches);

    if (allMatches.length > 0) {
      /* 🔷 logging: log the rag tool usage (dense + rerank score per match) */
      const rerankById = new Map(rerank.map((r) => [r.id, r.rerank]));
      tools.push({
        tool: "rag",
        details: {
          match_count: allMatches.length,
          matches: allMatches.map((m) => ({
            score: m.score,
            rerank_score: rerankById.get(m.id) ?? null,
            metadata: (() => {
              const { text, ...rest } = m.metadata ?? {};
              return rest;
            })(),
            text: m.metadata?.text,
          })),
        },
      });
    }

    /*
     * ✏️ per-query-type instructions
     */
    if (agentConfig.promptAddition) {
      messages.push({
        role: "system",
        content: `INSTRUCTIONS FOR THIS QUESTION (type: ${queryClassification}):\n${agentConfig.promptAddition}`,
      });
    }

    /*
     * ✏️ add the user query at the end of the messages
     */
    messages.push({ role: "user", content: query });
    console.log("debug: user query ", query);

    console.log(
      "DEBUG: FINAL CONTEXT SENT TO AGENT",
      JSON.stringify(messages, null, 2),
    );

    /*
     * 🤖 stream the LLM response
     */
    const stream = new ReadableStream({
      async start(controller) {
        let replyText = "";

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          stream: true,
          temperature: 0, // deterministic
          top_p: 1,
          max_completion_tokens: agentConfig.maxResponseTokens ?? 150,
        });

        try {
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              replyText += content;
              controller.enqueue(content);
            }
          }
          replyText = replyText.trim();

          /*
           * 🔷 logging: write to agent history
           */
          const history_object: HistoryLog = {
            user_id,
            query,
            query_classification: queryClassification,
            response: replyText,
            response_time: Date.now() - timerStart,
            tools,
            details: {
              requestId,
              query: {
                original: originalQuery,
                rewritten: searchQuery,
              },
              locationContext,
              prompt_source: redisPrompt ? "cms" : "default",
              classification: {
                type: queryClassification,
                confidence: classificationConfidence,
                fallback: classificationFallback,
              },
            },
          };
          await logAgentHistory(history_object);
          logAppEvent({
            event_type: "agent_webhook",
            event_message: "agent request completed",
            event_details: {
              request_id: requestId,
              user_id,

              query: {
                original: postedQuery,
                final: query,
                corrected: postedQuery !== query,
              },

              location: locationContext,

              classification: {
                type: queryClassification,
                confidence: classificationConfidence,
                fallback: classificationFallback,
              },

              conversation: {
                history_count: trimmedHistory.length,
                summary_used: Boolean(conversationSummary),
              },

              retrieval: {
                search_query: searchQuery,
                contextual_requested: useContextual,
                global_requested: useGlobal,
                filter: filter ?? null,
                dense_floor: DENSE_FLOOR,
                rerank_min: RERANK_MIN,
                contextual_raw: raw.contextual.length,
                global_raw: raw.global.length,
                dense_candidates: candidates,
                final_matches: allMatches.length,
                rerank_failed: rerankFailed,
                retrieval_ms: retrievalMs,
                // [{id, object_id, dense, rerank}] — the threshold calibration data
                reranked: rerank,
              },

              response: {
                source: allMatches.length > 0 ? "rag" : "none",
                length: replyText.length,
                response_time_ms: Date.now() - timerStart,
              },

              prompt_source: redisPrompt ? "cms" : "default",
            },
          });
          logAppEvent({
            event_type: "agent_webhook_rag",
            event_message: `RAG results for: ${query}`,
            event_details: {
              request_id: requestId,
              query,
              search_query: searchQuery,
              classification: queryClassification,
              // every chunk Pinecone returned, before floor/rerank
              contextual: raw.contextual,
              global: raw.global,
            },
          });

          /*
           * 🧾 wrap up: update the chat history in redis
           */
          const MAX_STORED_MESSAGES = 100;
          const updatedHistory = [
            ...chatHistory,
            { role: "user", content: query },
            { role: "assistant", content: replyText },
          ].slice(-MAX_STORED_MESSAGES);
          await redis.set(
            memoryKey,
            JSON.stringify(updatedHistory),
            { EX: 60 * 60 * 24 * 30 }, // 30 day TTL
          );

          controller.close();
          void cacheResponse({
            question: query,
            answer: replyText,
            locationId: locationContext?.locationId,
          });
        } catch (err) {
          console.error("Stream error:", err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("agent webhook error:", err);
    Sentry.captureException(err);
    return new Response("Internal server error", { status: 500 });
  }
};

/**
 * get the summary of the conversation
 * @param redis
 * @param sessionId
 * @param chatHistory
 * @returns string
 */
async function getConversationSummary(
  redis: any,
  key: string,
  chatHistory: any[],
): Promise<string> {
  const summaryKey = `summary:${key}`;

  // Get existing summary
  let existingSummary = await redis.get(summaryKey);

  // Only generate summary if we have enough messages (5+)
  if (chatHistory.length < 5) {
    return existingSummary || "";
  }

  // Update summary every 5 messages
  if (chatHistory.length % 5 === 0 || !existingSummary) {
    try {
      const recentMessages = chatHistory
        .slice(-5)
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const prompt = existingSummary
        ? `Previous conversation summary:
${existingSummary}

Recent messages:
${recentMessages}

Update the conversation summary for future turns.

Preserve important subjects from the previous summary and incorporate new information from the recent messages.

Focus on:
- artworks, objects, people, artists, exhibitions, places, and subjects being discussed
- important facts established during the conversation
- relationships between subjects that may matter for follow-up questions
- unresolved questions or topics the visitor is still discussing

Do not summarize every message or describe the conversation generally. Capture the context needed to understand future follow-up questions such as "why?", "what about him?", "was that intentional?", or "what else is in it?"

Keep the summary concise, 2-3 sentences.`
        : `Summarize this conversation for future follow-up questions.

Identify the important artworks, objects, people, artists, exhibitions, places, and subjects being discussed.

Include important context or relationships established in the conversation and any unresolved questions the visitor is pursuing.

Do not summarize every message. Capture only the context needed to understand future follow-up questions.

Keep the summary concise, 2-3 sentences.

Conversation:
${recentMessages}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_completion_tokens: 150,
      });

      existingSummary = response.choices[0].message?.content?.trim() || "";
      await redis.set(summaryKey, existingSummary, { EX: 24 * 60 * 60 });
    } catch (err) {
      Sentry.captureException(err);
    }
  }

  return existingSummary || "";
}

/**
 * Builds the Pinecone filter for the "contextual" namespace based on the
 * active query type's config flags.
 *
 * CURRENT STATE (placeholder, not final):
 * - geoFiltered only knows about a single resolved `place` (from request body /
 *   QR code / venue selector) — not real proximity yet.
 *
 * TODO — geoFiltered needs to grow into several distinct strategies:
 *
 * 1. Real lat/lng proximity: once resolveNearbyPlaces(userLat, userLng) exists,
 *    swap the single `place` $eq for `place_id: { $in: nearbyPlaceIds }` /
 *    `exhibition_id: { $in: nearbyExhibitionIds }`. Keep today's single-place
 *    $eq as the fallback when lat/lng isn't available yet, so behavior doesn't
 *    regress for institutions that haven't rolled geo out.
 *
 * 2. NOT every type's "nearby" logic should live here:
 *    - a future "where is X?" type should NOT be geo-scoped — the visitor is
 *      asking specifically because the thing ISN'T nearby.
 *    - visual_id doesn't use this function's geo clause at all. Its geo
 *      scoping happens via a separate hop: resolveNearbyArtworks() from
 *      Redis -> artwork_id: { $in: [...] } filter against the GLOBAL
 *      namespace, not this contextual filter.
 *
 * 3. comparative entity-pair resolution: once the pipeline can resolve a
 *    query like "compare this room to the Rothko room" into two specific
 *    place/exhibition IDs, that resolved $in filter should REPLACE the geo
 *    clause for that call, not stack with it — combining "near me" AND
 *    "matches these two specific IDs" at once can over-constrain and
 *    silently return zero results for the entity that isn't nearby.
 *    This function will need a `resolvedEntityIds?: string[]` param that,
 *    when present, takes priority over the geoFiltered clause.
 *
 * 4. discovery's highlight-filter fallback (retry without is_highlight if
 *    starved) is a runtime retry that depends on inspecting RESULTS, not
 *    something this function can express — that logic stays one level up,
 *    in the pipeline, as a second call to this function / a second query.
 */
async function buildContextualPineconeFilter(
  agentConfig: AgentConfig,
  locationContext: LocationContext,
  userLat?: number,
  userLong?: number,
): Promise<Record<string, any> | undefined> {
  const clauses: Record<string, any>[] = [];

  const placeId = locationContext?.placeId;
  const exhibitionId = locationContext?.exhibitionId;

  // Build the place/exhibition scope clause without fabricating ids —
  // only include a sub-clause for the ones we actually have.
  const scopeClause = [
    exhibitionId ? { exhibition_id: { $eq: exhibitionId } } : null,
    placeId ? { place_id: { $eq: placeId } } : null,
  ].filter(Boolean) as Record<string, any>[];

  const scope = scopeClause.length > 1 ? { $or: scopeClause } : scopeClause[0];

  if (agentConfig.geoFiltered) {
    const wantsProximity = agentConfig.nearbyRadiusMeters != null;
    const hasCoords = userLat != null && userLong != null;
    let nearbyIds: string[] = [];

    if (wantsProximity && hasCoords) {
      const resolved = await resolveNearbyItems(
        locationContext?.locationId,
        userLat,
        userLong,
        agentConfig.nearbyRadiusMeters!,
      );
      nearbyIds = agentConfig.nearbyLimit
        ? resolved.slice(0, agentConfig.nearbyLimit)
        : resolved;
    }

    if (nearbyIds.length > 0 && scope) {
      clauses.push({
        $and: [{ object_id: { $in: nearbyIds } }, scope],
      });
    } else if (nearbyIds.length > 0) {
      // Have nearby ids but no place/exhibition scope at all — filter on
      // proximity alone rather than silently dropping the geo filter.
      clauses.push({ object_id: { $in: nearbyIds } });
    } else if (scope) {
      clauses.push(scope);
    }
  }

  if (clauses.length === 0) return undefined;
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}

async function cacheResponse({
  question,
  answer,
  locationId,
}: {
  question: string;
  answer: string;
  locationId: string;
}) {
  try {
    const decision = await determineCacheDecision(question, answer);

    console.log(
      "cacheResponse: decision",
      decision,
      "question:",
      question,
      "answer:",
      answer,
    );

    if (!decision.cacheable) {
      return;
    }

    await storeCache(
      question,
      answer,
      {
        locationId,
      },
      decision,
    );
  } catch (error) {
    console.error("Failed to cache response:", error);
  }
}

// This function takes the single location id
// and resolves it to a place id and exhibition id if applicable.
type LocationContext = {
  locationId: string;
  placeId: string;
  exhibitionId?: string;
};
async function resolveLocationId(
  locationId: string,
  supabase: SupabaseClient,
): Promise<LocationContext> {
  // Look for locationId as a child
  const { data, error } = await supabase
    .from("location_relationships")
    .select("child_id, parent_id, child_type, parent_type")
    .eq("child_id", locationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return {
      locationId,
      placeId: data.parent_id,
      exhibitionId:
        data.child_type === "exhibition" ? data.child_id : undefined,
    };
  }

  // No parent means this is already the parent/place
  return {
    locationId,
    placeId: locationId,
  };
}
