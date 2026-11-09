import OpenAI from "openai";
import type { AgentChatMessage } from "~/types";

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });

/** How many recent messages the rewrite sees, to resolve follow-ups. */
const HISTORY_MESSAGES = 6;

/** Guide answers can be long; this is enough to know what was discussed. */
const HISTORY_MAX_CHARS = 400;

/** Voice latency budget for this step. On timeout we search with the raw query. */
const TIMEOUT_MS = 4000;

/** "Spanish" from "es"; the code itself if Intl doesn't know it. */
function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * The rewrite instructions. `contentLanguage` is the language the venue's
 * content is written in: the query must match it, whatever the visitor
 * spoke.
 */
const system = (contentLanguage: string) => {
  const name = languageName(contentLanguage);
  return `You turn a museum visitor's spoken question into a search query.
Return JSON only: {"search_query": string}

Rules:
- Always write search_query in ${name}, the language of the museum's content, whatever language the visitor used. Translate it if needed; never return it in another language.
- One standalone question or noun phrase, max 25 words.
- Keep names, objects, specimens and catalog numbers (e.g. "AMNH 9951") exactly as given. Do not translate or correct them.
- If a name looks like a speech-to-text mishearing of a name used earlier in the conversation, use the earlier spelling.
- Remove instructions about the answer ("briefly", "describe", "without too much detail", "if available").
- Remove facts the visitor asserts; keep only what they are asking.
  ("Confirm: X is a curator at Y" -> "Who is X?")
- If they describe what they are looking at, keep the key nouns of that description.
- Keep references to where they are ("this hall", "here", "what am I looking at", "these skeletons"). Don't turn "Which hall is this?" into a general question like "Which hall has elephants?".
- Resolve pronouns and follow-ups ("it", "him", "and how old is it?") using the recent conversation.
- You may also get the visitor's exact words, from speech-to-text. The question is the voice agent's version of them and usually the clearer one. But if the exact words name something the question dropped or changed (often a misheard name the agent guessed at), search for what the visitor said.
- Do not answer the question.`;
};

export interface SearchQueryResult {
  /** Cleaned-up query in the content language, for retrieval only. */
  searchQuery: string;
  /** True when the rewrite failed and searchQuery is the visitor's query unchanged. */
  fallback: boolean;
}

/**
 * Builds the retrieval query: in the venue's content language (translated
 * if the visitor spoke another one) and cleaned up for search (see system()). The answering model still gets the visitor's own
 * words; this is used only for embedding and reranking.
 *
 * Never throws: on any failure it returns the visitor's query unchanged
 * with `fallback: true`.
 */
export async function buildSearchQuery(
  query: string,
  history: AgentChatMessage[] = [],
  /** The visitor's message as heard (speech-to-text), when the agent sends it. */
  visitorWords: string | null = null,
  /** ISO 639-1 language of the venue's content (getContentLanguage). */
  contentLanguage: string = "en",
): Promise<SearchQueryResult> {
  const fallback: SearchQueryResult = { searchQuery: query, fallback: true };

  // History goes in as quoted context, not as chat turns, so the model
  // treats it as background instead of continuing the conversation.
  const recent = history
    .slice(-HISTORY_MESSAGES)
    .map(
      (m) =>
        `${m.role === "user" ? "visitor" : "guide"}: ${String(m.content).slice(0, HISTORY_MAX_CHARS)}`,
    )
    .join("\n");

  const words = differentWords(query, visitorWords)
    ? `\n\nVisitor's exact words (speech-to-text):\n${visitorWords}`
    : "";
  const userContent = recent
    ? `Recent conversation:\n${recent}\n\nVisitor's latest question:\n${query}${words}`
    : `Visitor's latest question:\n${query}${words}`;

  try {
    const res = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system(contentLanguage) },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        max_tokens: 100,
        temperature: 0,
      },
      { timeout: TIMEOUT_MS, maxRetries: 0 },
    );

    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}");
    const searchQuery =
      typeof parsed.search_query === "string" ? parsed.search_query.trim() : "";

    return searchQuery ? { searchQuery, fallback: false } : fallback;
  } catch (err) {
    console.error("[guide] buildSearchQuery failed", err);
    return fallback;
  }
}

/**
 * True when the visitor's exact words say something the query doesn't,
 * ignoring case and punctuation. When they match there's nothing to add.
 */
export function differentWords(
  query: string,
  visitorWords: string | null | undefined,
): visitorWords is string {
  if (!visitorWords) return false;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  return norm(query) !== norm(visitorWords);
}
