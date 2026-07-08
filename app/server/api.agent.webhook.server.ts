import type { ActionFunction } from "react-router";
import { getRedis } from "~/utils/redis.server";
import OpenAI from "openai";
import {
  zeroPersonalityPrompt,
  mitPrompt,
  role,
  context,
  goals,
  accuracy,
  guardrails,
  mitRole,
  mitContext,
} from "~/utils/system.prompt";
import { queryPinecone, PINECONE_SCORE } from "~/utils/pinecone";
import { fetchWikipedia } from "~/utils/wikipedia.tool";
import { searchCache, storeCache } from "~/utils/cache.server";
import { correctTranscription } from "~/utils/query-correction.server";
import { logAgentHistory } from "~/utils/history.server";
import { HistoryLog } from "~/types";
import * as Sentry from "@sentry/react-router";
import { logAppEvent } from "~/utils/events/appEvents.server";

import { handleLegacyWebhook } from "./api.agent.webhook.legacy.server";

let USE_LEGACY = false;

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });
const MAX_MESSAGES = 10;
let PROMPT = `${role}\n\n${context}\n\n${goals}\n\n${accuracy}\n\n${guardrails}`;

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
     * process body vars
     */
    const { query: postedQuery, user_id, place, user_lat, user_long } = body;
    console.log("agent got location ", user_lat, user_long);

    const useLegacy = USE_LEGACY || place === "mit" || place === "wonderway";

    if (useLegacy) {
      console.log("using legacy webhook for place:", place);
      return await handleLegacyWebhook({ ...args, request: clonedRequest });
    }

    // TODO work in here.
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
        logAppEvent({
          event_type: "agent_log",
          event_message: `Auto-generated follow-up : ${followUp}`,
        });
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
