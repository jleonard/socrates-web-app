import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });

// ============================================================================
// Query Type Config
// Single source of truth for what happens after classifyQuery() returns a type.
// ============================================================================

import type { AgentChatMessage, AgentQueryType } from "~/types";

export interface ClassificationResult {
  type: AgentQueryType;
  confidence: number;
}

// Runtime-checkable list, derived from the AgentQueryType union so there's one
// source of truth — if you add a type to AgentQueryType, add it here too and
// TS/the array literal below are the only two places that need updating.
const VALID_QUERY_TYPES: AgentQueryType[] = [
  "factual",
  "visual_id",
  "comparative",
  "contextual",
  "interpretive",
  "discovery",
  "navigational_facility",
  "navigational_locate",
  "navigational_route",
  "operational",
];

const CLASSIFY_SYSTEM_PROMPT = `Classify the visitor's query into exactly one type:
 
factual                  - specific fact lookup (dates, names, who/what/when)
visual_id                 - identify or describe what they're currently looking at
comparative                - relate or contrast two or more things
contextual                  - narrative background on ONE specific place/artwork/exhibition
interpretive                - broad philosophical, cultural, historical, or theoretical questions
                             ("why does this movement matter", "what was the artist reacting against")
discovery                    - recommend or rank across MANY things ("what should I see", "highlights")
navigational_facility          - amenities: bathrooms, exits, cafes, entrances
navigational_locate             - find the location of a specific named place/artwork/exhibition
navigational_route                - multi-stop itinerary or route planning
operational                        - hours, tickets, pricing, accessibility, policies
 
Distinguish interpretive from contextual: contextual asks "tell me about this place/thing,"
interpretive asks "why does this matter" or "what does this mean" — it seeks meaning,
influence, or significance rather than description.
 
Use conversation history to disambiguate pronouns and follow-ups
(e.g. "how do I get there?" after discussing a specific room = navigational_locate).
 
Respond with JSON only: {"type": "...", "confidence": 0.0-1.0}`;

// Fallback when the model returns something unparseable or an unknown type.
// "contextual" is the safest default — it runs both namespaces at moderate
// topK, which is the closest thing this system has to a generic query.
const FALLBACK_TYPE: AgentQueryType = "contextual";

function isValidQueryType(value: unknown): value is AgentQueryType {
  return (
    typeof value === "string" && (VALID_QUERY_TYPES as string[]).includes(value)
  );
}

export async function classifyQuery(
  query: string,
  recentHistory: AgentChatMessage[] = [],
): Promise<ClassificationResult> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
        // last couple turns is enough for pronoun/follow-up disambiguation —
        // classification doesn't need the full conversation
        ...recentHistory
          .slice(-2)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: query },
      ],
      response_format: { type: "json_object" },
      max_tokens: 30,
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      return { type: FALLBACK_TYPE, confidence: 0 };
    }

    const parsed = JSON.parse(raw) as { type?: unknown; confidence?: unknown };

    const type = isValidQueryType(parsed.type) ? parsed.type : FALLBACK_TYPE;
    const confidence =
      typeof parsed.confidence === "number" &&
      parsed.confidence >= 0 &&
      parsed.confidence <= 1
        ? parsed.confidence
        : 0.5;

    return { type, confidence };
  } catch (err) {
    // Network error, malformed JSON, whatever — never let classification
    // failure take down the whole query pipeline. Degrade to the safe default.
    console.error("classifyQuery failed, falling back to default type:", err);
    return { type: FALLBACK_TYPE, confidence: 0 };
  }
}

// ============================================================================
// Usage
// ============================================================================
//
// const classification = await classifyQuery(userQuery, chatHistory);
// const config = QUERY_TYPE_CONFIG[classification.type];
//
// for (const tool of config.tools) {
//   switch (tool) {
//     case "pinecone_contextual": /* run contextual vector search using config.contextualTopK, etc. */ break;
//     case "pinecone_global":     /* run global vector search using config.globalTopK, etc. */ break;
//     case "redis_operational":   /* direct Redis read, no embedding call */ break;
//     case "redis_facility":      /* direct Redis read, no embedding call */ break;
//     case "route_planner":       /* invoke planRoute() */ break;
//     case "wiki_fallback":       /* only fire if RAG coverage after pinecone_* is weak */ break;
//   }
// }
//
// const systemPrompt = `${BASE_SYSTEM_PROMPT}\n\n${config.promptAddition}`;
