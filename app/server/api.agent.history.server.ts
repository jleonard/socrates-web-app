import type { ActionFunction } from "react-router";
import { getRedis } from "~/utils/redis.server";
import OpenAI from "openai";

import { historyPrompt } from "~/utils/system.prompt";
import { logAgentHistory } from "~/utils/history.server";
import { HistoryLog } from "~/types";
import * as Sentry from "@sentry/react-router";

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });
const MAX_MESSAGES = 20;
let PROMPT = historyPrompt;

export const handleWebhook: ActionFunction = async ({ request }) => {
  const redis = await getRedis();

  try {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = await request.json();

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

    console.log("history agent :: ", query);

    const memoryKey = `chat:${user_id}`;

    // --- 1️⃣ Load recent chat history ---
    const memoryJson = await redis.get(memoryKey);
    const chatHistory = memoryJson ? JSON.parse(memoryJson) : [];

    // --- 3️⃣ Keep last N messages ---
    const trimmedHistory = chatHistory.slice(-MAX_MESSAGES);

    // 🆕 Get conversation summary
    const summaryKey = `summary:${user_id}`;
    let existingSummary = await redis.get(summaryKey);

    if (!existingSummary) {
      existingSummary = "no prior conversation found";
    }

    const summaryMessage = {
      role: "system",
      content: `Summary of previous conversation context: ${existingSummary}`,
    };

    const systemMessage = { role: "system", content: PROMPT };

    const messages = [
      systemMessage,
      { role: "user", content: query },
      summaryMessage,
      ...trimmedHistory,
    ];

    console.log("history agent prompt :: ", messages);

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
