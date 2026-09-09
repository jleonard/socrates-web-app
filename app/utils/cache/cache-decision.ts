import OpenAI from "openai";
import type { CacheDecision } from "./cache.types";

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

/**
 * Determines whether a visitor question + agent answer should
 * be stored in the reusable response cache.
 *
 * This utility does NOT interact with Redis and does not need to
 * know the current place. It only determines:
 *
 * 1. Is this Q&A worth caching?
 * 2. If so, should it be reusable globally or only at a place?
 *
 * If classification fails, we fail closed and don't cache.
 * Cache classification should never break the main agent flow.
 */
export async function determineCacheDecision(
  question: string,
  answer: string,
): Promise<CacheDecision> {
  const normalizedQuestion = question.trim();
  const normalizedAnswer = answer.trim();

  // Don't make an LLM call for obviously invalid input.
  if (!normalizedQuestion || !normalizedAnswer) {
    return {
      cacheable: false,
      scope: "place",
    };
  }

  try {
    const response = await openai.responses.create({
      model: "gpt-5-mini",

      input: [
        {
          role: "system",
          content: CACHE_DECISION_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: JSON.stringify({
            question: normalizedQuestion,
            answer: normalizedAnswer,
          }),
        },
      ],

      // Structured output keeps the result predictable.
      text: {
        format: {
          type: "json_schema",
          name: "cache_decision",
          strict: true,
          schema: {
            type: "object",
            properties: {
              cacheable: {
                type: "boolean",
              },
              scope: {
                type: "string",
                enum: ["place", "global"],
              },
            },
            required: ["cacheable", "scope"],
            additionalProperties: false,
          },
        },
      },
    });

    const output = response.output_text;

    if (!output) {
      console.warn("Cache decision returned no output");

      return {
        cacheable: false,
        scope: "place",
      };
    }

    const decision = JSON.parse(output) as CacheDecision;

    // Defensive validation even though structured output is used.
    if (
      typeof decision.cacheable !== "boolean" ||
      (decision.scope !== "place" && decision.scope !== "global")
    ) {
      console.warn("Invalid cache decision:", decision);

      return {
        cacheable: false,
        scope: "place",
      };
    }

    // Scope doesn't matter for a non-cacheable answer.
    if (!decision.cacheable) {
      return {
        cacheable: false,
        scope: "place",
      };
    }

    return decision;
  } catch (error) {
    // Cache classification should never break the agent.
    console.error("Failed to determine cache decision:", error);

    return {
      cacheable: false,
      scope: "place",
    };
  }
}

/**
 * Prompt used to determine whether a Q&A is reusable.
 *
 * The important question is not simply:
 *
 * "Is this a good question?"
 *
 * Instead:
 *
 * "Would another visitor plausibly ask this question and
 * benefit from receiving this same answer?"
 *
 * We bias toward place-scoped caching because AYAPI is
 * a site-specific visitor experience.
 */
const CACHE_DECISION_SYSTEM_PROMPT = `
You determine whether a visitor question and an agent answer
should be stored in a reusable cache.

The cache exists to speed up future visitor conversations by
reusing answers that are likely to be useful to other visitors.

Evaluate the QUESTION and ANSWER together.

Return exactly:

{
  "cacheable": boolean,
  "scope": "place" | "global"
}

## CACHEABLE

Set "cacheable": true when the question and answer represent
useful, reusable information that another visitor could
reasonably ask and benefit from receiving the same answer.

Good cache candidates include:

- Factual questions about art, history, culture, science,
  artists, objects, exhibitions, or institutions.
- Common educational questions.
- Questions about the meaning, significance, history, or context
  of something.
- Questions that are likely to recur among visitors.
- Questions where the answer is stable and useful beyond the
  current conversation.
- Questions where another visitor could reasonably benefit from
  the same answer.

## DO NOT CACHE

Set "cacheable": false when the question or answer is not
meaningfully reusable for another visitor.

Do not cache:

- Personalized recommendations.
- Questions about what this particular visitor should do next.
- Questions that depend on the visitor's personal preferences.
- Questions whose answer depends on information provided by
  the current visitor.
- Conversational small talk.
- Casual conversation.
- Subjective opinions that would not be useful as factual
  visitor information.
- Speculative or uncertain answers.
- Answers that are heavily tailored to the current conversation.
- Temporary or highly time-sensitive information.
- Information that is likely to change frequently.
- Requests for actions specific to the current visitor.
- Questions where the answer would be misleading when shown
  to another visitor.

The goal is quality over quantity.

It is better NOT to cache an answer than to cache an answer
that another visitor could receive incorrectly or out of context.

## CACHE SCOPE

If "cacheable": true, determine whether the answer should be
scoped to a place or available globally.

### PLACE

Use:

"scope": "place"

when the answer depends on the visitor's current institution
or exhibition context.

This should be the DEFAULT whenever there is meaningful
uncertainty.

Examples:

- "Why is this exhibition important?"
- "Tell me about this museum's collection."
- "Why is this work significant?"
- "Why is this object displayed here?"
- "What should I know about this exhibition?"
- Information about an institution or exhibition.
- Information that is particularly relevant to the current
  visitor location.
- Questions where the same wording could have a different
  useful answer at another institution or exhibition.

### GLOBAL

Use:

"scope": "global"

ONLY when the answer is genuinely independent of the visitor's
current institution or exhibition.

Examples:

- "Who was Pablo Picasso?"
- "What is Cubism?"
- "What is chiaroscuro?"
- "When did the Renaissance begin?"
- General historical, artistic, scientific, or cultural facts
  that remain valid regardless of where the visitor is.

Do NOT choose global simply because the answer happens to be
generally true.

If the current place could meaningfully affect the answer,
choose "place".

## IMPORTANT DECISION RULES

1. Evaluate both the question AND the answer.
2. Do not cache merely because a question sounds interesting.
3. The answer must provide reusable value to another visitor.
4. Prefer place-scoped caching when context matters.
5. Only use global scope when the answer is clearly independent
   of the current place.
6. When uncertain whether something is reusable, choose:
   "cacheable": false
7. When uncertain between place and global, choose:
   "place"

Return JSON only.
`;
