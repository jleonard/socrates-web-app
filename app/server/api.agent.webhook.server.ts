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
    const [contextualResults, globalResults] = await Promise.all([
      index.namespace("contextual").query({
        vector: queryEmbedding,
        topK: 5,
        includeMetadata: true,
        filter: {
          $or: [
            { exhibition_id: { $eq: place } },
            { place_id: { $eq: place } },
          ],
        },
      }),
      index.namespace("global").query({
        vector: queryEmbedding,
        topK: 3,
        includeMetadata: true,
      }),
    ]);
    console.log("debug: pinecone contextualResults ", contextualResults);
    console.log("debug: pinecone globalResults ", globalResults);

    /*
     * 🌲 pinecone part two: filter results
     */
    const SCORE_THRESHOLDS = {
      contextual: 0.65,
      global: 0.6,
    };
    function filterByScore(
      matches: ScoredPineconeRecord<RecordMetadata>[],
      threshold: number,
    ) {
      return matches.filter((match) => (match.score ?? 0) >= threshold);
    }

    const contextualMatches = filterByScore(
      contextualResults.matches,
      SCORE_THRESHOLDS.contextual,
    );

    const globalMatches = filterByScore(
      globalResults.matches,
      SCORE_THRESHOLDS.global,
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
    const wikiPromise = fetchWikipedia(query);

    const WIKI_SCORE_THRESHOLD = 0.65;
    const WIKI_MIN_MATCHES = 2;

    const strongMatches = allMatches.filter(
      (m) => (m.score ?? 0) >= WIKI_SCORE_THRESHOLD,
    );

    const shouldFallbackToWiki = strongMatches.length < WIKI_MIN_MATCHES;
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
          max_completion_tokens: 150,
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
            query_classification: "on-topic",
            response: replyText,
            response_time: Date.now() - timerStart,
            tools,
            details: {
              place,
              prompt_source: redisPrompt ? "contextual" : "default",
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
