import type { ActionFunction } from "react-router";
import { getRedis } from "~/utils/redis.server";
import OpenAI from "openai";
import { aboutPrompt } from "~/utils/system.prompt";
import { queryPinecone, PINECONE_SCORE } from "~/utils/pinecone";
import { searchCache, storeCache } from "~/utils/cache.server";
import { logAgentHistory } from "~/utils/history.server";
import { HistoryLog } from "~/types";
import * as Sentry from "@sentry/react-router";
import { logAppEvent } from "~/utils/events/appEvents.server";

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });
const MAX_MESSAGES = 10;
let PROMPT = aboutPrompt;

export const handleWebhook: ActionFunction = async ({ request }) => {
  const redis = await getRedis();

  try {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = await request.json();

    /*
     * process body vars
     */
    const { query: postedQuery, user_id } = body;

    /* log the query */
    logAppEvent({
      event_type: "agent_log",
      event_message: `posted query : ${postedQuery}`,
      event_details: {
        user_id,
      },
    });

    const query = postedQuery;

    // used to log response times
    let timer_start = new Date();

    // the object that gets logged to the history table
    let history_object: HistoryLog = {
      user_id: user_id,
      query,
      query_classification: "on-topic",
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

    let pinecone_index = "wonderway-about";
    let pinecone_namespace = "__default__";

    history_object.rag_index = pinecone_index;

    if (!query || !user_id) {
      return new Response("Missing required fields", { status: 400 });
    }

    // --- 2️⃣ Try semantic cache hit first ---
    const cached = await searchCache(query);

    if (cached) {
      history_object.tool_cache = true;
      history_object.response_time = Date.now() - timer_start.getTime();
      history_object.response = cached.answer;
      await logAgentHistory(history_object);

      /* log the cached response */
      logAppEvent({
        event_type: "agent_log",
        event_message: `cached response : ${cached.answer}`,
        event_details: {
          user_id,
          tool_cache: true,
        },
      });

      return new Response(cached.answer, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const memoryKey = `chat:${user_id}`;

    // --- 1️⃣ Load recent history ---
    const memoryJson = await redis.get(memoryKey);
    const chatHistory = memoryJson ? JSON.parse(memoryJson) : [];

    // --- 2️⃣ Add new user message ---
    chatHistory.push({ role: "user", content: query });

    // --- 3️⃣ Keep last N messages ---
    const trimmedHistory = chatHistory.slice(-MAX_MESSAGES);

    // 🆕 Get conversation summary
    const summary = await getConversationSummary(redis, user_id, chatHistory);

    // --- 3.5️⃣ Query Pinecone RAG ---
    const { context, avgScore } = await queryPinecone(
      query,
      pinecone_index,
      pinecone_namespace,
    );
    history_object.rag_score = avgScore;
    history_object.text_rag = context;

    /* log rag response */
    logAppEvent({
      event_type: "agent_log",
      event_message: `rag response : ${context}`,
      event_details: {
        rag_used: avgScore > PINECONE_SCORE ? true : false,
        rag_score: avgScore,
        user_id,
      },
    });

    // --- 4️⃣ Prepare RAG / fallback message ---
    let ragContent: string;

    if (avgScore > PINECONE_SCORE && context) {
      history_object.tool_rag = true;
      // Strong RAG context
      ragContent = `Verified RAG context (confidence ${avgScore.toFixed(
        2,
      )}):\n${context}`;
    } else {
      // No verified context → GPT must **indicate uncertainty**
      ragContent = `No RAG context was found for this query. Do not attempt to answer. Inform the user that you do not have the answer to this question.`;

      logAppEvent({
        event_type: "agent_log",
        event_message: `no agent tool response`,
        event_details: {
          user_id,
        },
      });
    }

    const systemMessage = { role: "system", content: PROMPT };
    const ragMessage = { role: "system", content: ragContent };

    const messages = [systemMessage, ragMessage, ...trimmedHistory];
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

          // --- 6️⃣ Save chat history ---
          trimmedHistory.push({ role: "assistant", content: replyText });
          await redis.set(memoryKey, JSON.stringify(trimmedHistory), {
            EX: 24 * 60 * 60,
          });

          // --- ✅ 7️⃣ Conditionally store in semantic cache ---
          const lower = replyText.toLowerCase();
          const isMeaningful =
            replyText.length > 20 && // not super short
            !lower.includes("i do not") && // uncertainty fallback
            !lower.startsWith("i'm not") &&
            !lower.startsWith("i can't") &&
            !lower.startsWith("i cannot") &&
            !lower.startsWith("i don't");

          // Only store if meaningful AND RAG/wikipedia gave some context
          if (isMeaningful) {
            try {
              await storeCache(query, replyText, "llm");
            } catch (err) {
              console.error("Cache store error:", err);
            }
          } else {
            console.log("⚠️ Not storing in cache - response not meaningful");
          }
          history_object.response_time = Date.now() - timer_start.getTime();
          history_object.response = replyText;
          await logAgentHistory(history_object);

          logAppEvent({
            event_type: "agent_log",
            event_message: `agent response : ${replyText}`,
            event_details: {
              user_id,
              response_time: history_object.response_time,
              tool_rag: history_object.tool_rag,
              tool_wikipedia: history_object.tool_wikipedia,
              "tool_fix-sppech": history_object["tool_fix-speech"],
            },
          });
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
