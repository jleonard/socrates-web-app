import OpenAI from "openai";
import type { AgentChatMessage, AgentQueryType } from "~/types";

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });

const VALID: AgentQueryType[] = [
  "factual",
  "visual_id",
  "comparative",
  "contextual",
  "interpretive",
  "discovery",
];

const SYSTEM = `You prepare a museum visitor's spoken question for search and routing.
Return JSON only: {"search_query": string, "type": string, "confidence": number}

search_query rules:
- English. One standalone sentence or noun phrase, max 25 words.
- Keep names, objects, specimens and catalog numbers (e.g. "AMNH 9951") exactly as given.
- If a name looks like a speech-to-text mishearing of a name used earlier in the conversation, use the earlier spelling.
- Remove response-style instructions ("briefly", "provide a description", "if available", "without too much detail").
- Remove facts the visitor asserts; keep only what they are asking.
  ("Confirm: X is a curator at Y" -> "Who is X?")
- If they describe what they are looking at, keep the key nouns of that description.
- Resolve pronouns and follow-ups using the previous turns.

type (pick one):
factual - specific fact lookup (dates, names, who/what/when), including where a named place/object is and hours, tickets, pricing, accessibility or policies
visual_id - identify or describe what they are looking at now
comparative - relate or contrast two or more things
contextual - background on ONE specific place/object/exhibition
interpretive - meaning, significance, influence
discovery - recommend or rank across many things`;

export interface RewriteResult {
  searchQuery: string;
  type: AgentQueryType;
  confidence: number;
  fallback: boolean;
}

export async function rewriteQuery(
  query: string,
  recentHistory: AgentChatMessage[] = [],
): Promise<RewriteResult> {
  const fallback: RewriteResult = {
    searchQuery: query,
    type: "contextual",
    confidence: 0,
    fallback: true,
  };
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM },
        ...recentHistory
          .slice(-2)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: query },
      ],
      response_format: { type: "json_object" },
      max_tokens: 150,
      temperature: 0,
    });
    const p = JSON.parse(res.choices[0]?.message?.content ?? "{}");
    if (typeof p.search_query !== "string" || !p.search_query.trim())
      return fallback;
    return {
      searchQuery: p.search_query.trim(),
      type: VALID.includes(p.type) ? p.type : "contextual",
      confidence: typeof p.confidence === "number" ? p.confidence : 0.5,
      fallback: !VALID.includes(p.type),
    };
  } catch (err) {
    console.error("rewriteQuery failed:", err);
    return fallback;
  }
}
