import type { ActionFunction } from "react-router";
import { getRedis } from "~/utils/redis.server";
import OpenAI from "openai";
import {
  factPrompt,
  zeroPersonalityPrompt,
  mitPrompt,
} from "~/utils/system.prompt";
import { queryPinecone, PINECONE_SCORE } from "~/utils/pinecone";
import { fetchWikipedia } from "~/utils/wikipedia.tool";
import { searchCache, storeCache } from "~/utils/cache.server";
import { correctTranscription } from "~/utils/query-correction.server";
import { logAgentHistory } from "~/utils/history.server";
import { HistoryLog } from "~/types";
import * as Sentry from "@sentry/react-router";

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });
const MAX_MESSAGES = 10;
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
    const { query: postedQuery, user_id, place } = body;

    const { corrected: correctedQuery, raw: rawQuery } =
      correctTranscription(postedQuery);

    const query = correctedQuery !== rawQuery ? correctedQuery : rawQuery;

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

    if (correctedQuery != rawQuery) {
      history_object["tool_fix-speech"] = true;
      history_object["query-before-fixing"] = postedQuery;
      console.log("corrected ", correctedQuery, rawQuery);
    }

    let pinecone_index, pinecone_namespace;

    switch (place) {
      case "mit":
        pinecone_index = "mit-rag";
        pinecone_namespace = "__default__";
        PROMPT = mitPrompt;
        break;
      default:
        pinecone_index = process.env.PINECONE_INDEX!;
        pinecone_namespace = "met";
    }
    // console.log("webhook query : ", query);
    // console.log("webhook place : ", place);
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

    // --- 3.75️⃣ Wikipedia fallback ---
    let wikiSummary: string | null = null;
    const wikiPromise = fetchWikipedia(query);

    if (avgScore <= PINECONE_SCORE) {
      wikiSummary = await wikiPromise;
    }

    // --- 4️⃣ Prepare RAG / fallback message ---
    let ragContent: string;

    if (avgScore > PINECONE_SCORE && context) {
      history_object.tool_rag = true;
      // Strong RAG context
      ragContent = `Verified RAG context (confidence ${avgScore.toFixed(
        2,
      )}):\n${context}`;
    } else if (wikiSummary) {
      history_object.tool_wikipedia = true;
      history_object.text_wikipedia = wikiSummary;
      // Wikipedia fallback only if it exists
      ragContent = `Wikipedia summary for "${query}":\n${wikiSummary}`;
    } else {
      // No verified context → GPT must **indicate uncertainty**
      ragContent = `No verified context found. 
Do **not** invent names, dates, or attributions. 
If you are unsure, respond exactly: "I do not have verified information about this."`;
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
    // console.log("Messages sent to OpenAI:", messages);

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
          controller.close();
          generateFollowUps(query, 3, pinecone_index, pinecone_namespace);
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

/**
 * Generate likely follow-up questions for a query and cache answers for all users.
 */
export async function generateFollowUps(
  query: string,
  n = 3,
  pinecone_index: string,
  pinecone_namespace: string,
) {
  /**
   * setup the history object for logging
   */
  let botUserId = "00000000-0000-4000-8000-000000000000";

  try {
    // 1️⃣ Ask GPT for follow-up questions
    const followUpsRes = await openai.chat.completions.create({
      model: "gpt-4o", // higher-power model for prediction
      messages: [
        {
          role: "system",
          content: `You are an AI assistant. Given the question "${query}", generate ${n} likely follow-up questions that a user may ask. Return only a JSON array of strings.`,
        },
      ],
      temperature: 0.7,
      max_completion_tokens: 200,
    });

    const followUpsText = followUpsRes.choices[0].message?.content || "[]";
    let followUpQuestions: string[] = [];
    try {
      followUpQuestions = JSON.parse(followUpsText);
    } catch (e) {
      Sentry.captureException(e);
      console.warn(
        "Failed to parse follow-up questions JSON:",
        followUpsText,
        e,
      );
    }

    // 2️⃣ Process each follow-up question
    for (const followUp of followUpQuestions) {
      // Skip empty or trivial follow-ups
      if (!followUp || followUp.length < 3) continue;

      /**
       * prep the history object
       */
      let history_object: HistoryLog = {
        user_id: botUserId,
        query: followUp,
        query_classification: "on-topic",
        tool_cache: false,
        tool_wikipedia: false,
        tool_rag: false,
        tool_followup: true,
        response: "",
        response_time: 0,
        text_wikipedia: null,
        text_rag: null,
        rag_index: pinecone_index,
      };

      // RAG + Wikipedia context
      const { context, avgScore } = await queryPinecone(
        followUp,
        pinecone_index,
        pinecone_namespace,
      );
      let wikiSummary: string | null = null;
      if (avgScore <= PINECONE_SCORE) {
        wikiSummary = await fetchWikipedia(followUp);
      }

      let ragContent: string;
      if (avgScore > PINECONE_SCORE && context) {
        history_object.rag_score = avgScore;
        history_object.text_rag = context;
        history_object.tool_rag = true;
        ragContent = `Verified RAG context (confidence ${avgScore.toFixed(2)}):\n${context}`;
      } else if (wikiSummary) {
        history_object.tool_wikipedia = true;
        history_object.text_wikipedia = wikiSummary;
        ragContent = `Wikipedia summary for "${followUp}":\n${wikiSummary}`;
      } else {
        ragContent = `No verified context found. If unsure, respond exactly: "I do not have verified information about this."`;
      }

      // GPT generates cached answer (no streaming)
      const completion = await openai.chat.completions.create({
        model: "gpt-4o", // higher-power model
        messages: [
          { role: "system", content: PROMPT },
          { role: "system", content: ragContent },
          { role: "user", content: followUp },
        ],
        temperature: 0,
        max_completion_tokens: 150,
      });

      const answer = completion.choices[0].message?.content?.trim() || "";

      // Only store meaningful answers
      const lower = answer.toLowerCase();
      const isMeaningful =
        answer.length > 20 &&
        !lower.includes("i do not") &&
        !lower.startsWith("i'm not") &&
        !lower.startsWith("i can't") &&
        !lower.startsWith("i cannot") &&
        !lower.startsWith("i don't");

      if (isMeaningful) {
        history_object.response = answer;
        await storeCache(followUp, answer, "follow-up");
        await logAgentHistory(history_object);
        console.log(`✅ Stored follow-up in cache: "${followUp}"`);
      } else {
        console.log(
          `⚠️ Skipped caching follow-up (not meaningful): "${followUp}"`,
        );
      }
    }
  } catch (err) {
    console.error("Follow-up generation error:", err);
    Sentry.captureException(err);
  }
}
