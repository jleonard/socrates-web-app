/**
 * Short lines the agent speaks as soon as the session connects, so visitors
 * hear that it's listening (the agents have no first message of their own).
 * One is picked at random per session, in the language the session starts
 * in, since the agent speaks it with that language's voice.
 *
 * Keyed by ISO 639-1, covering the start languages in agents.server.ts.
 */
const FIRST_MESSAGES: Record<string, readonly string[]> = {
  // a greeting up front sets a cheerful read; a bare "I'm here!" sometimes
  // came out like someone answering from another room
  en: ["Hi! I'm here!", "Hey there! Ready when you are!", "Hi! Ask away!"],
  es: [
    "¡Hola! ¡Aquí estoy!",
    "¡Hola! ¡Cuando quieras, empezamos!",
    "¡Hola! ¡Pregunta lo que quieras!",
  ],
  zh: ["你好！我在这儿！", "嗨！随时准备好了！", "你好！尽管问吧！"],
};

const FALLBACK_LANGUAGE = "en";

/** A random first message in `language` (English if there are none for it). */
export function pickFirstMessage(language: string | null | undefined): string {
  const lines =
    (language && FIRST_MESSAGES[language]) || FIRST_MESSAGES[FALLBACK_LANGUAGE];
  return lines[Math.floor(Math.random() * lines.length)];
}
