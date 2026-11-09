import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });

/**
 * gpt-4.1: in the Nov 2026 QA replay it used and attributed an interview
 * source that gpt-4o contradicted with its own knowledge, and framed general
 * knowledge more reliably, at the same latency. (gpt-4o had replaced
 * gpt-4o-mini in Oct 2026, which dropped facts that were in the sources.)
 */
const ANSWER_MODEL = "gpt-4.1";

/**
 * A ceiling, not a target: the prompt shapes length (max ~4 sentences).
 * Hitting this cuts the reply mid-sentence, so keep it well above that.
 */
const MAX_ANSWER_TOKENS = 400;

/**
 * 0 so the same question gets the same answer (consistent facts, and QA
 * replays that can be compared). Variety in phrasing comes from the voice
 * agent, which rewords the answer for speech.
 */
const TEMPERATURE = 0;

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
