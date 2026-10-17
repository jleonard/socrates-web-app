import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });

/** Same model the old webhook answers with. */
const ANSWER_MODEL = "gpt-4o-mini";

/**
 * A ceiling, not a target: the prompt shapes length (max ~4 sentences).
 * Hitting this cuts the reply mid-sentence, so keep it well above that.
 */
const MAX_ANSWER_TOKENS = 400;

/**
 * Slightly above 0 so framing phrases ("That's not covered here, but…")
 * vary across a conversation as the prompt asks.
 */
const TEMPERATURE = 0.3;

/** Streams the answer text, chunk by chunk. Throws if the request fails. */
export async function* streamAnswer(
  messages: ChatCompletionMessageParam[],
): AsyncGenerator<string> {
  const completion = await openai.chat.completions.create({
    model: ANSWER_MODEL,
    messages,
    stream: true,
    temperature: TEMPERATURE,
    max_completion_tokens: MAX_ANSWER_TOKENS,
  });

  for await (const chunk of completion) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) yield content;
  }
}
