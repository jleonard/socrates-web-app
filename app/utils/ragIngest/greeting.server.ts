import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getRedis } from "~/utils/redis.server";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_ACCESS_SECRET!,
  },
});

const S3_BUCKET = process.env.AWS_BUCKET!;
const S3_FOLDER = "greetings";

const ELEVENLABS_VOICE_ID = "FUfBrNit0NNZAwb58KWH";

export async function processGreeting(greeting: string, entity_id: string) {
  const redis = await getRedis();
  const startTime = Date.now();
  const redisKey = `greeting:${entity_id}`;
  const s3Key = `${S3_FOLDER}/${entity_id}.mp3`;

  console.log(`[processGreeting] Starting for entity ${entity_id}`);

  try {
    // Check Redis
    console.time(`[processGreeting] Redis GET ${entity_id}`);

    let existingGreeting: string | null;

    try {
      existingGreeting = await redis.get(redisKey);
    } catch (error) {
      console.error(
        `[processGreeting] Redis GET failed for ${entity_id}`,
        error,
      );
      throw new Error(
        `Failed to check existing greeting in Redis for entity ${entity_id}`,
        { cause: error },
      );
    }

    console.timeEnd(`[processGreeting] Redis GET ${entity_id}`);

    if (existingGreeting === greeting) {
      console.log(
        `[processGreeting] Greeting unchanged for ${entity_id}, skipping TTS`,
      );

      return {
        changed: false,
        key: s3Key,
      };
    }

    console.log(
      `[processGreeting] Greeting changed for ${entity_id}, generating new audio`,
    );

    // Generate audio with ElevenLabs
    console.time(`[processGreeting] ElevenLabs TTS ${entity_id}`);

    let response: Response;

    try {
      response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": process.env.ELEVENLABS_TTS_KEY!,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: greeting,
            model_id: "eleven_multilingual_v2",
          }),
        },
      );
    } catch (error) {
      console.error(
        `[processGreeting] ElevenLabs request failed for ${entity_id}`,
        error,
      );

      throw new Error(`ElevenLabs TTS request failed for entity ${entity_id}`, {
        cause: error,
      });
    }

    console.timeEnd(`[processGreeting] ElevenLabs TTS ${entity_id}`);

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        `[processGreeting] ElevenLabs returned ${response.status} for ${entity_id}: ${errorText}`,
      );

      throw new Error(
        `ElevenLabs TTS failed (${response.status}) for entity ${entity_id}: ${errorText}`,
      );
    }

    console.time(`[processGreeting] Read audio ${entity_id}`);

    let audioBuffer: Buffer;

    try {
      audioBuffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      console.error(
        `[processGreeting] Failed to read ElevenLabs audio for ${entity_id}`,
        error,
      );

      throw new Error(
        `Failed to read ElevenLabs audio for entity ${entity_id}`,
        { cause: error },
      );
    }

    console.timeEnd(`[processGreeting] Read audio ${entity_id}`);

    console.log(
      `[processGreeting] Generated ${audioBuffer.length} bytes of audio for ${entity_id}`,
    );

    // Upload to S3
    console.time(`[processGreeting] S3 upload ${entity_id}`);

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: s3Key,
          Body: audioBuffer,
          ContentType: "audio/mpeg",
        }),
      );
    } catch (error) {
      console.error(
        `[processGreeting] S3 upload failed for ${entity_id}`,
        error,
      );

      throw new Error(
        `Failed to upload greeting to S3 for entity ${entity_id}`,
        { cause: error },
      );
    }

    console.timeEnd(`[processGreeting] S3 upload ${entity_id}`);

    console.log(`[processGreeting] S3 upload successful: ${s3Key}`);

    // Only update Redis after successful TTS + S3 upload
    console.time(`[processGreeting] Redis SET ${entity_id}`);

    try {
      await redis.set(redisKey, greeting);
    } catch (error) {
      console.error(
        `[processGreeting] Redis SET failed for ${entity_id}`,
        error,
      );

      throw new Error(
        `Failed to update greeting in Redis for entity ${entity_id}`,
        { cause: error },
      );
    }

    console.timeEnd(`[processGreeting] Redis SET ${entity_id}`);

    console.log(
      `[processGreeting] Completed successfully for ${entity_id} in ${
        Date.now() - startTime
      }ms`,
    );

    return {
      changed: true,
      key: s3Key,
    };
  } catch (error) {
    console.error(
      `[processGreeting] FAILED for entity ${entity_id} after ${
        Date.now() - startTime
      }ms`,
      error,
    );

    throw error;
  }
}
