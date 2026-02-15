import type { ActionFunction } from "react-router";
import { getRedis } from "~/utils/redis.server";
import OpenAI from "openai";
import { factPrompt, zeroPersonalityPrompt } from "~/utils/system.prompt";
import { queryPinecone, PINECONE_SCORE } from "~/utils/pinecone";
import { fetchWikipedia } from "~/utils/wikipedia.tool";
import { searchCache, storeCache } from "~/utils/cache.server";

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });
const MAX_MESSAGES = 10;
const PROMPT = zeroPersonalityPrompt;

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
    const { query, user_session, place } = body;
    console.log("the agent says the place is ", place);

    if (!query || !user_session) {
      return new Response("Missing required fields", { status: 400 });
    }

    // --- 2️⃣ Try semantic cache hit first ---
    const cached = await searchCache(query);
    if (cached) {
      return new Response(cached.answer, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const memoryKey = `chat:${user_session}`;

    // --- 1️⃣ Load recent history ---
    const memoryJson = await redis.get(memoryKey);
    const chatHistory = memoryJson ? JSON.parse(memoryJson) : [];

    // --- 2️⃣ Add new user message ---
    chatHistory.push({ role: "user", content: query });

    // --- 3️⃣ Keep last N messages ---
    const trimmedHistory = chatHistory.slice(-MAX_MESSAGES);

    // --- 3.5️⃣ Query Pinecone RAG ---
    const { context, avgScore } = await queryPinecone(query);
    const wikiPromise = fetchWikipedia(query);
    console.log("avgScore:", avgScore);

    // --- 3.75️⃣ Wikipedia fallback ---
    let wikiSummary: string | null = null;

    if (avgScore <= PINECONE_SCORE) {
      wikiSummary = await wikiPromise;
      console.log("Wikipedia summary:", wikiSummary);
    }

    // --- 4️⃣ Prepare RAG / fallback message ---
    let ragContent: string;

    if (avgScore > PINECONE_SCORE && context) {
      // Strong RAG context
      ragContent = `Verified RAG context (confidence ${avgScore.toFixed(
        2,
      )}):\n${context}`;
    } else if (wikiSummary) {
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
          controller.close();
          generateFollowUps(query, 3);
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
    return new Response("Internal server error", { status: 500 });
  }
};

/**
 * Generate likely follow-up questions for a query and cache answers for all users.
 */
export async function generateFollowUps(query: string, n = 3) {
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

      // RAG + Wikipedia context
      const { context, avgScore } = await queryPinecone(followUp);
      let wikiSummary: string | null = null;
      if (avgScore <= PINECONE_SCORE) {
        wikiSummary = await fetchWikipedia(followUp);
      }

      let ragContent: string;
      if (avgScore > PINECONE_SCORE && context) {
        ragContent = `Verified RAG context (confidence ${avgScore.toFixed(2)}):\n${context}`;
      } else if (wikiSummary) {
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
        await storeCache(followUp, answer, "follow-up");
        console.log(`✅ Stored follow-up in cache: "${followUp}"`);
      } else {
        console.log(
          `⚠️ Skipped caching follow-up (not meaningful): "${followUp}"`,
        );
      }
    }
  } catch (err) {
    console.error("Follow-up generation error:", err);
  }
}
