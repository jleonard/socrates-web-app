import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_ACCESS_SECRET!,
  },
});

const S3_BUCKET = process.env.AWS_BUCKET!;

export async function saveAudioBuffer(audioBuffer: Buffer, s3Path: string) {
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Path,
        Body: audioBuffer,
        ContentType: "audio/mpeg",
      }),
    );
    return true;
  } catch (error) {
    console.error(
      `[s3: saveAudioBuffer] S3 upload failed for audio buffer upload ${s3Path}`,
      error,
    );

    throw new Error(
      `[s3: saveAudioBuffer] S3 upload failed for audio buffer upload ${s3Path}`,
      {
        cause: error,
      },
    );
  }
}
