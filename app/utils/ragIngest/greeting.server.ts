import { getRedis } from "~/utils/redis.server";
import { textToSpeech } from "../elevenlabs/tts";
import { DEFAULT_LOCALE, SupportedLocale, ttsLanguages } from "../i18n/config";
import { translateWithLLM } from "../i18n/llmTranslate";
import { saveAudioBuffer } from "../s3/s3";

const S3_FOLDER = "greetings";

export async function processGreeting(greeting: string, entity_id: string) {
  const redis = await getRedis();
  const redisKey = `greeting:${entity_id}`;

  console.log(`[processGreeting] Starting for entity ${entity_id}`);

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

    if (existingGreeting === greeting) {
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
          locale === DEFAULT_LOCALE
            ? greeting
            : await translateWithLLM(greeting, locale);

        const audioBuffer = await textToSpeech(text, elevenlabsVoiceId);
        await saveAudioBuffer(audioBuffer, s3Key);
      }),
    );

    // save the new greeting text in redis so we don't reprocess every time
    // strapi changes
    try {
      await redis.set(redisKey, greeting);
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
