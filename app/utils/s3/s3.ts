import { DeleteObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

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

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Uploads an image (e.g. a Dropbox room's card) under `s3Path`. The
 * extension sets the content type. Throws when the upload fails.
 */
export async function saveImageBuffer(imageBuffer: Buffer, s3Path: string) {
  const ext = s3Path.split(".").pop()?.toLowerCase() ?? "";
  const contentType = IMAGE_TYPES[ext];
  if (!contentType) {
    throw new Error(`[s3: saveImageBuffer] unsupported image type: ${s3Path}`);
  }
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Path,
        Body: imageBuffer,
        ContentType: contentType,
        // the key changes with the content, so it can be cached for good
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  } catch (error) {
    throw new Error(`[s3: saveImageBuffer] S3 upload failed for ${s3Path}`, {
      cause: error,
    });
  }
}

/** Deletes objects by key; missing keys are not an error. Throws on failure. */
export async function deleteObjects(s3Paths: string[]) {
  if (s3Paths.length === 0) return;
  try {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: S3_BUCKET,
        Delete: { Objects: s3Paths.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  } catch (error) {
    throw new Error(`[s3: deleteObjects] S3 delete failed for ${s3Paths.join(", ")}`, {
      cause: error,
    });
  }
}

/** Public URL for an object, via CloudFront (CLOUDFRONT_URL); null when unset. */
export function publicUrl(s3Path: string): string | null {
  const base = process.env.CLOUDFRONT_URL?.replace(/\/+$/, "");
  return base ? `${base}/${s3Path}` : null;
}
