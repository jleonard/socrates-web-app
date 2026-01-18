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

export function isMeaningfulResponse(text: string): boolean {
  if (!text) return false;
  const normalized = text.trim();
  if (normalized.length <= 20) return false;
  const lower = normalized.toLowerCase();
  const disallowedStarts = [
    "i'm not",
    "i am not",
    "i can't",
    "i cannot",
    "i don't",
  ];
  const disallowedIncludes = ["i do not"];
  if (disallowedIncludes.some((p) => lower.includes(p))) return false;
  if (disallowedStarts.some((p) => lower.startsWith(p))) return false;
  return true;
}

/**
 * 🆕 Generate a rolling conversation summary
 */
async function getConversationSummary(
  redis: any,
  sessionId: string,
  chatHistory: any[]
): Promise<string> {
  const summaryKey = `summary:${sessionId}`;

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
      console.error("Summary generation error:", err);
    }
  }

  return existingSummary || "";
}

export const handleWebhook: ActionFunction = async ({ request }) => {
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

    // Try semantic cache first
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

    // Load recent history
    const memoryJson = await redis.get(memoryKey);
    const chatHistory = memoryJson ? JSON.parse(memoryJson) : [];

    // Add new user message
    chatHistory.push({ role: "user", content: query });

    // Keep last N messages
    const trimmedHistory = chatHistory.slice(-MAX_MESSAGES);

    // 🆕 Get conversation summary
    const summary = await getConversationSummary(
      redis,
      user_session,
      chatHistory
    );

    // Query Pinecone RAG
    const { context, avgScore } = await queryPinecone(query);

    // Wikipedia fallback
    const wikiPromise = fetchWikipedia(query);
    let wikiSummary: string | null = null;

    if (avgScore <= PINECONE_SCORE) {
      wikiSummary = await wikiPromise;
    }

    // Prepare RAG / fallback message
    let ragContent: string;

    if (avgScore > PINECONE_SCORE && context) {
      ragContent = `Verified RAG context (confidence ${avgScore.toFixed(2)}):\n${context}`;
    } else if (wikiSummary) {
      ragContent = `Wikipedia summary for "${query}":\n${wikiSummary}`;
    } else {
      ragContent = `No verified context found. 
Do **not** invent names, dates, or attributions. 
If you are unsure, respond exactly: "I do not have verified information about this."`;
    }

    // Build system messages in priority order:
    // 1. Base system prompt
    // 2. RAG context (most relevant to current query)
    // 3. Conversation summary (background context)
    const messages: any[] = [
      { role: "system", content: PROMPT },
      { role: "system", content: ragContent },
    ];

    // 🆕 Add conversation summary if it exists
    if (summary) {
      messages.push({
        role: "system",
        content: `Previous conversation context: ${summary}`,
      });
    }

    messages.push(...trimmedHistory);

    // Streaming response
    const stream = new ReadableStream({
      async start(controller) {
        let replyText = "";

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          stream: true,
          temperature: 0,
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

          // Save chat history
          trimmedHistory.push({ role: "assistant", content: replyText });
          await redis.set(memoryKey, JSON.stringify(trimmedHistory), {
            EX: 24 * 60 * 60,
          });

          // Conditionally store in semantic cache
          const isMeaningful = isMeaningfulResponse(replyText);

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
    const followUpsRes = await openai.chat.completions.create({
      model: "gpt-4o",
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
        e
      );
    }

    for (const followUp of followUpQuestions) {
      if (!followUp || followUp.length < 3) continue;

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

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: PROMPT },
          { role: "system", content: ragContent },
          { role: "user", content: followUp },
        ],
        temperature: 0,
        max_completion_tokens: 150,
      });

      const answer = completion.choices[0].message?.content?.trim() || "";
      const isMeaningful = isMeaningfulResponse(answer);

      if (isMeaningful) {
        await storeCache(followUp, answer, "follow-up");
        console.log(`✅ Stored follow-up in cache: "${followUp}"`);
      } else {
        console.log(
          `⚠️ Skipped caching follow-up (not meaningful): "${followUp}"`
        );
      }
    }
  } catch (err) {
    console.error("Follow-up generation error:", err);
  }
}
