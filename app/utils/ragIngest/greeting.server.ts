import { getRedis } from "~/utils/redis.server";
import { textToSpeech } from "../elevenlabs/tts";
import { DEFAULT_LOCALE, SupportedLocale, ttsLanguages } from "../i18n/config";
import { translateWithLLM } from "../i18n/llmTranslate";
import { saveAudioBuffer } from "../s3/s3";

const S3_FOLDER = "greetings";

/**
 * Generates the greeting mp3 for every TTS language
 * (`greetings/<entity_id>-<locale>.mp3`).
 *
 * The greeting is written in `sourceLanguage` (the place's content
 * language, ISO 639-1; English when unset): that locale's mp3 uses the text
 * as written, every other locale gets an LLM translation of it. A source
 * language with no TTS locale (e.g. "fr") is translated into all of them.
 */
export async function processGreeting(
  greeting: string,
  entity_id: string,
  sourceLanguage: string = DEFAULT_LOCALE,
) {
  const redis = await getRedis();
  const redisKey = `greeting:${entity_id}`;
  // English keeps the bare text, so greetings stored before languages were
  // tracked don't all regenerate; other languages are prefixed, so changing
  // a place's language (with the same text) regenerates its audio.
  const fingerprint =
    sourceLanguage === DEFAULT_LOCALE
      ? greeting
      : `${sourceLanguage}:${greeting}`;

  console.log(
    `[processGreeting] Starting for entity ${entity_id} (${sourceLanguage})`,
  );

  try {
    let existingGreeting: string | null;

    try {
      existingGreeting = await redis.get(redisKey);
    } catch (error) {
      throw new Error(
        `Failed to check existing greeting in Redis for entity ${entity_id}`,
        { cause: error },
      );
    }

    if (existingGreeting === fingerprint) {
      return {
        changed: false,
        key: redisKey,
      };
    }

    await Promise.all(
      (
        Object.entries(ttsLanguages) as [
          SupportedLocale,
          (typeof ttsLanguages)[SupportedLocale],
        ][]
      ).map(async ([locale, { elevenlabsVoiceId }]) => {
        const s3Key = `${S3_FOLDER}/${entity_id}-${locale}.mp3`;

        const text =
          locale === sourceLanguage
            ? greeting
            : await translateWithLLM(greeting, locale);

        const audioBuffer = await textToSpeech(text, elevenlabsVoiceId);
        await saveAudioBuffer(audioBuffer, s3Key);
      }),
    );

    // save the new greeting text in redis so we don't reprocess every time
    // strapi changes
    try {
      await redis.set(redisKey, fingerprint);
    } catch (error) {
      throw new Error(
        `Failed to update greeting in Redis for entity ${entity_id}`,
        { cause: error },
      );
    }

    return {
      changed: true,
      key: redisKey,
    };
  } catch (error) {
    throw error;
  }
}
