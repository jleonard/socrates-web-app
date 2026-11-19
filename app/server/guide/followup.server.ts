import type { AgentChatMessage } from "~/types";
import type { AnswerMode } from "./prompt.server";

/**
 * Follow-up suggestions ("Want to hear how Effie was found?") are the
 * guide's job, not the voice agent's: left to the agent, its LLM ended
 * nearly every answer with one, including offers of directions the guide
 * had no information for (AMNH QA, Nov 2026). Here the server decides WHEN
 * one is allowed and the answer model decides WHETHER there's a good one.
 *
 * Allowed only when:
 * - the answer is grounded (retrieval found something), so the suggestion
 *   can point at something the next answer will actually have, and
 * - none of the last FOLLOWUP_GAP guide replies ended with a question
 *   (a suggestion, or a clarifying question such as "which one do you
 *   mean?"), i.e. at most one in every FOLLOWUP_GAP + 1 answers.
 *
 * Pure function over the history already loaded: no extra I/O.
 */
const FOLLOWUP_GAP = 2;

export function followUpAllowed(
  history: AgentChatMessage[],
  mode: AnswerMode,
): boolean {
  if (mode !== "grounded") return false;
  const recent = history
    .filter((m) => m.role === "assistant")
    .slice(-FOLLOWUP_GAP);
  return !recent.some((m) => endsWithQuestion(m.content));
}

/** "?" plus the full-width and Arabic question marks. */
export function endsWithQuestion(text: unknown): boolean {
  return typeof text === "string" && /[?？؟]["'”»)\s]*$/.test(text.trim());
}
