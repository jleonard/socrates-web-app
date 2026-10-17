import OpenAI from "openai";
import { ttsLanguages, type SupportedLocale } from "./config";

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });

export async function translateWithLLM(
  text: string,
  locale: SupportedLocale,
): Promise<string> {
  let response: OpenAI.Chat.Completions.ChatCompletion;

  try {
    response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You translate spoken greetings for a museum guide app. Translate the text into ${ttsLanguages[locale].prompt}. Keep proper nouns (people, museums, places) unchanged. Keep the tone warm and natural for being read aloud. Reply with only the translation, with no quotes or commentary.`,
        },
        {
          role: "user",
          content: text,
        },
      ],
    });
  } catch (error) {
    console.error(
      `[translateWithLLM] OpenAI request failed for ${locale}`,
      error,
    );

    throw new Error(`translateWithLLM: OpenAI request failed for ${locale}`, {
      cause: error,
    });
  }

  const translated = response.choices[0]?.message?.content?.trim();

  if (!translated) {
    throw new Error(
      `translateWithLLM: Translation returned no text for ${locale}`,
    );
  }

  return translated;
}
