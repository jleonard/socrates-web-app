import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getRedis } from "~/utils/redis.server";
const redis = await getRedis();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
});

const S3_BUCKET = process.env.AWS_BUCKET!;
const S3_FOLDER = "greetings";

const ELEVENLABS_VOICE_ID = "FUfBrNit0NNZAwb58KWH";

export async function processGreeting(greeting: string, entity_id: string) {
  const redisKey = `greeting:${entity_id}`;

  // Check whether this greeting is already cached
  const existingGreeting = await redis.get(redisKey);

  if (existingGreeting === greeting) {
    return {
      changed: false,
      key: `${S3_FOLDER}/${entity_id}.mp3`,
    };
  }

  // Generate new audio with ElevenLabs
  const response = await fetch(
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

  if (!response.ok) {
    const error = await response.text();

    throw new Error(`ElevenLabs TTS failed (${response.status}): ${error}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  // Save audio to S3
  const s3Key = `${S3_FOLDER}/${entity_id}.mp3`;

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: audioBuffer,
      ContentType: "audio/mpeg",
    }),
  );

  // Only update Redis after the audio was successfully generated and uploaded
  await redis.set(redisKey, greeting);

  return {
    changed: true,
    key: s3Key,
  };
}
