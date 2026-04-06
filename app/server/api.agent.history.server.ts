import type { ActionFunction } from "react-router";
import { getRedis } from "~/utils/redis.server";
import OpenAI from "openai";

import {
  factPrompt,
  zeroPersonalityPrompt,
  mitPrompt,
} from "~/utils/system.prompt";

import { searchCache, storeCache } from "~/utils/cache.server";
import { logAgentHistory } from "~/utils/history.server";
import { HistoryLog } from "~/types";
import * as Sentry from "@sentry/react-router";

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });
const MAX_MESSAGES = 20;
let PROMPT = zeroPersonalityPrompt;

export const handleWebhook: ActionFunction = async ({ request }) => {
  const redis = await getRedis();

  try {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = await request.json();

    /*
     * @TODO - place is the new dynamic var passed from front end -> eleven labs tool -> webhook
     * the default var for place will be 'wonderway'
     */
    const { query, user_id } = body;

    // used to log response times
    let timer_start = new Date();

    // the object that gets logged to the history table
    let history_object: HistoryLog = {
      user_id: user_id,
      query,
      query_classification: "history",
      tool_cache: false,
      tool_wikipedia: false,
      tool_rag: false,
      tool_followup: false,
      response: "",
      response_time: 0,
      text_wikipedia: null,
      text_rag: null,
      rag_index: null,
    };

    if (!query || !user_id) {
      return new Response("Missing required fields", { status: 400 });
    }

    const memoryKey = `chat:${user_id}`;

    // --- 1️⃣ Load recent history ---
    const memoryJson = await redis.get(memoryKey);
    const chatHistory = memoryJson ? JSON.parse(memoryJson) : [];

    // --- 3️⃣ Keep last N messages ---
    const trimmedHistory = chatHistory.slice(-MAX_MESSAGES);

    // 🆕 Get conversation summary
    const summary = await getConversationSummary(redis, user_id, chatHistory);

    const systemMessage = { role: "system", content: PROMPT };

    const messages = [systemMessage, ...trimmedHistory];

    // 🆕 Add conversation summary if it exists
    if (summary) {
      messages.push({
        role: "system",
        content: `Previous conversation context: ${summary}`,
      });
    }

    // --- 5️⃣ Streaming response ---
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

          history_object.response_time = Date.now() - timer_start.getTime();
          history_object.response = replyText;
          await logAgentHistory(history_object);
          controller.close();
        } catch (err) {
          // todo sentry
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
    console.error("Webhook error:", err);
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
        ? `Previous summary: ${existingSummary}\n\nRecent messages:\n${recentMessages}\n\nUpdate the summary to include new topics while keeping previous context. Keep it concise (2-3 sentences).`
        : `Summarize the main topics discussed in this art conversation in 2-3 sentences:\n\n${recentMessages}`;

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
      console.error("Summary generation error:", err);
    }
  }

  return existingSummary || "";
}
