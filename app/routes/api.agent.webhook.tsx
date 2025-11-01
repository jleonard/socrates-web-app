import type { ActionFunction } from "react-router";
import { getRedis } from "~/utils/redis.server";
import OpenAI from "openai";
import { prompt } from "~/utils/system.prompt";
import { queryPinecone, debugPinecone } from "~/utils/pinecone";

const redis = await getRedis();
const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });

const MAX_MESSAGES = 10;

export const action: ActionFunction = async ({ request }) => {
  /* debugPinecone(); */
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

    // --- 2️⃣ Add the new user message ---
    chatHistory.push({ role: "user", content: query });

    // --- 3️⃣ Keep last N messages ---
    const trimmedHistory = chatHistory.slice(-MAX_MESSAGES);

    // --- 3.5️⃣ Query Pinecone RAG ---
    const { context, avgScore } = await queryPinecone(query);

    // --- 4️⃣ Prepare messages for OpenAI ---
    const systemMessage = {
      role: "system",
      content: prompt,
    };

    const ragMessage = {
      role: "system",
      content:
        avgScore > 0.7
          ? `Relevant art history context (confidence ${avgScore.toFixed(2)}):\n${context}`
          : `No strong RAG context found (confidence ${avgScore.toFixed(2)}). 
If the RAG context seems incomplete, rely on your own art history expertise.`,
    };

    const messages = [systemMessage, ragMessage, ...trimmedHistory];

    // --- 5️⃣ Create a streaming response ---
    const stream = new ReadableStream({
      async start(controller) {
        let replyText = "";

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          stream: true,
        });

        try {
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              replyText += content;
              controller.enqueue(content); // send each token
            }
          }

          // --- 6️⃣ Save chat history after full reply ---
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
