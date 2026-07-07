import type { ActionFunction } from "react-router";
import { getRedis } from "~/utils/redis.server";
import OpenAI from "openai";
import {
  role,
  context,
  goals,
  accuracy,
  guardrails,
} from "~/utils/system.prompt";
import {
  queryPinecone,
  getQueryEmbedding,
  PINECONE_SCORE,
} from "~/utils/pinecone";
import { fetchWikipedia } from "~/utils/wikipedia.tool";
import { storeCache } from "~/utils/cache.server";
import { correctTranscription } from "~/utils/query-correction.server";
import { logAgentHistory } from "~/utils/history.server";
import { HistoryLog, ToolLog } from "~/types";
import * as Sentry from "@sentry/react-router";
import { logAppEvent } from "~/utils/events/appEvents.server";
import {
  Pinecone,
  type RecordMetadata,
  type ScoredPineconeRecord,
} from "@pinecone-database/pinecone";
import { classifyQuery } from "~/server/agent/query.classifier.server";
import { QUERY_TYPE_CONFIG } from "~/server/agent/agent.config";
import { AgentConfig } from "~/types";

import { handleLegacyWebhook } from "./api.agent.webhook.legacy.server";

let USE_LEGACY = false;

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });
const MAX_CHAT_MESSAGES = 10;
let PROMPT = `${role}\n\n${context}\n\n${goals}\n\n${accuracy}\n\n${guardrails}`;

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

export const handleWebhook: ActionFunction = async (args) => {
  const { request } = args;
  const clonedRequest = request.clone();
  const redis = await getRedis();

  try {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = await request.json();

    /*
     * 📦 process body vars
     */
    const { query, user_id, place } = body;

    /* 🔷 logging: prep the history log */
    const timerStart = Date.now();
    const tools: ToolLog[] = [];

    /* 🔷 logging: log the query */
    logAppEvent({
      event_type: "agent_log",
      event_message: `posted query : ${query}`,
      event_details: {
        user_id,
        place,
      },
    });

    /*
     * 📦 temp route to the legacy webhook until MIT migrates.
     */
    const useLegacy = USE_LEGACY || place === "mit" || place === "wonderway";
    if (useLegacy) {
      console.log("using legacy webhook for place:", place);
      return await handleLegacyWebhook({ ...args, request: clonedRequest });
    }

    /*
     * ✏️ TODO fix mispronounciations
     */

    /*
     * ✏️ setup the messages array we'll send to the LLM
     */
    let messages = [];

    /*
     * ✏️ pull the prompt from redis or fallback
     */
    const redisPrompt = await redis.get("prompt:" + place);
    const prompt = redisPrompt || PROMPT;
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
     * ✏️ classify the query
     */
    const queryClassification = await classifyQuery(query, trimmedHistory);
    const agentConfig = QUERY_TYPE_CONFIG[queryClassification.type];

    /*
     * 💬 get the conversation summary
     */
    const conversationSummary = await getConversationSummary(
      redis,
      user_id,
      chatHistory,
    );
    if (conversationSummary) {
      messages.push({
        role: "system",
        content: `Previous conversation summary: ${conversationSummary}`,
      });
    }
    console.log("debug: conversationSummary ", conversationSummary);

    /*
     * 🌲 pinecone part one: get results
     */
    const index = pc.index("wonderway");
    const queryEmbedding = await getQueryEmbedding(query);
    const useContextual = agentConfig.tools.includes("pinecone_contextual");
    const useGlobal = agentConfig.tools.includes("pinecone_global");
    const [contextualResults, globalResults] = await Promise.all([
      useContextual
        ? index.namespace("contextual").query({
            vector: queryEmbedding,
            topK: agentConfig.contextualTopK,
            includeMetadata: true,
            filter: buildContextualPineconeFilter(agentConfig, place),
          })
        : Promise.resolve({ matches: [] }),
      useGlobal
        ? index.namespace("global").query({
            vector: queryEmbedding,
            topK: agentConfig.globalTopK,
            includeMetadata: true,
          })
        : Promise.resolve({ matches: [] }),
    ]);
    console.log("debug: pinecone contextualResults ", contextualResults);
    console.log("debug: pinecone globalResults ", globalResults);

    /*
     * 🌲 pinecone part two: filter results
     */
    function filterByScore(
      matches: ScoredPineconeRecord<RecordMetadata>[],
      threshold: number | null,
    ) {
      if (threshold === null) return matches; // no score gate — e.g. discovery
      return matches.filter((match) => (match.score ?? 0) >= threshold);
    }

    const contextualMatches = filterByScore(
      contextualResults.matches,
      agentConfig.contextualScoreThreshold,
    );

    const globalMatches = filterByScore(
      globalResults.matches,
      agentConfig.globalScoreThreshold,
    );

    const allMatches = [...contextualMatches, ...globalMatches];
    if (allMatches.length === 0) {
      messages.push({
        role: "system",
        content: `No specific RAG context was found for this query. Answer generally if you can, or let the user know you don't have specific information.`,
      });
    } else {
      messages.push({
        role: "system",
        content: `RAG CONTEXT:\n${allMatches
          .map((m) => m.metadata?.text)
          .filter(Boolean)
          .join("\n\n")}`,
      });
    }
    console.log("debug: allMatches filtered ", allMatches);

    if (allMatches.length > 0) {
      /* 🔷 logging: log the rag tool usage */
      tools.push({
        tool: "rag",
        details: {
          match_count: allMatches.length,
          matches: allMatches.map((m) => ({
            score: m.score,
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
     * 🌍 wikipedia fallback
     */
    let wikiSummary: string | null = null;
    const wikiPromise = agentConfig.tools.includes("wiki_fallback")
      ? fetchWikipedia(query)
      : Promise.resolve(null);

    const WIKI_SCORE_THRESHOLD = 0.65;
    const WIKI_MIN_MATCHES = 2;

    const strongMatches = allMatches.filter(
      (m) => (m.score ?? 0) >= WIKI_SCORE_THRESHOLD,
    );

    const shouldFallbackToWiki =
      strongMatches.length < WIKI_MIN_MATCHES &&
      agentConfig.tools.includes("wiki_fallback");
    if (shouldFallbackToWiki) {
      wikiSummary = await wikiPromise;

      if (wikiSummary) {
        messages.push({
          role: "system",
          content: `WIKIPEDIA CONTEXT:\n${wikiSummary}`,
        });
        console.log("debug: wikipedia summary ", wikiSummary);
      } else {
        messages.push({
          role: "system",
          content: `No relevant information found on Wikipedia.`,
        });
      }

      if (wikiSummary) {
        /* 🔷 logging: log the wikipedia tool usage */
        tools.push({
          tool: "wikipedia",
          details: { summary: wikiSummary },
        });
      }
    }

    /*
     * ✏️ add the user query at the end of the messages
     */
    messages.push({ role: "user", content: query });
    console.log("debug: user query ", query);

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
            query_classification: queryClassification.type,
            response: replyText,
            response_time: Date.now() - timerStart,
            tools,
            details: {
              place,
              prompt_source: redisPrompt ? "cms" : "default",
            },
          };
          await logAgentHistory(history_object);

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
        ? `Previous conversation summary: ${existingSummary}\n\nRecent messages:\n${recentMessages}\n\nUpdate the summary to include new topics while keeping previous context. Keep it concise (2-3 sentences).`
        : `Summarize the main topics discussed in this conversation in 2-3 sentences:\n\n${recentMessages}`;

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
 *    - navigational_locate has geoFiltered: false ON PURPOSE — it's an
 *      institution-wide name lookup, the visitor is asking specifically
 *      because the thing ISN'T nearby. Don't accidentally geo-scope it.
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
function buildContextualPineconeFilter(
  agentConfig: AgentConfig,
  place: string,
): Record<string, any> {
  const clauses: Record<string, any>[] = [];

  if (agentConfig.geoFiltered) {
    // TODO: replace with nearbyPlaceIds/$in once lat/lng lands — see note 1 above
    clauses.push({
      $or: [{ exhibition_id: { $eq: place } }, { place_id: { $eq: place } }],
    });
  }

  if (agentConfig.highlightFiltered) {
    clauses.push({ is_highlight: { $eq: true } });
  }

  if (clauses.length === 0) return {}; // neither flag set — unfiltered search
  if (clauses.length === 1) return clauses[0]; // no need for $and wrapper with just one clause
  return { $and: clauses }; // both flags set — combine with $and
}
