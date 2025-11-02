import type { ActionFunction } from "react-router";
import { getRedis } from "~/utils/redis.server";
import OpenAI from "openai";
import { factPrompt } from "~/utils/system.prompt";
import { queryPinecone, PINECONE_SCORE } from "~/utils/pinecone";
import { fetchWikipedia } from "~/utils/wikipedia.tool";

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });
const MAX_MESSAGES = 10;

export const action: ActionFunction = async ({ request }) => {
  const redis = await getRedis();

  try {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = await request.json();
    const { query, user_session } = body;

    if (!query || !user_session) {
      return new Response("Missing required fields", { status: 400 });
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
    console.log("avgScore:", avgScore);

    // --- 3.75️⃣ Wikipedia fallback ---
    let wikiSummary: string | null = null;
    if (avgScore <= PINECONE_SCORE) {
      wikiSummary = await fetchWikipedia(query);
      console.log("Wikipedia summary:", wikiSummary);
    }

    // --- 4️⃣ Prepare RAG / fallback message ---
    let ragContent: string;

    if (avgScore > PINECONE_SCORE && context) {
      // Strong RAG context
      ragContent = `Verified RAG context (confidence ${avgScore.toFixed(
        2
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

    const systemMessage = { role: "system", content: factPrompt };
    const ragMessage = { role: "system", content: ragContent };

    const messages = [systemMessage, ragMessage, ...trimmedHistory];
    console.log("Messages sent to OpenAI:", messages);

    // --- 5️⃣ Streaming response ---
    const stream = new ReadableStream({
      async start(controller) {
        let replyText = "";

        const completion = await openai.chat.completions.create({
          model: "gpt-4",
          messages,
          stream: true,
          temperature: 0, // deterministic
          top_p: 1,
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
    return new Response("Internal server error", { status: 500 });
  }
};
