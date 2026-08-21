/*
 * This is a webhook endpoint for receiving EXIF data from n8n.
 */

import exifr from "exifr";
import type { ActionFunctionArgs } from "react-router";

const SHARED_SECRET = process.env.N8N_SHARED_SECRET!; // same secret used by the markdown endpoint

interface DropboxFile {
  id: string;
  name: string;
  dropbox_path: string;
  client_modified: string;
}

interface ExifPayload {
  file: DropboxFile;
  content_base64: string; // raw image bytes, base64-encoded
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.headers.get("x-api-key") !== "wonderway-2026") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: ExifPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { file, content_base64 } = payload;

  if (!file?.id) {
    return Response.json({ error: "Missing file.id" }, { status: 400 });
  }
  if (!content_base64) {
    return Response.json({ error: "Missing content_base64" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(content_base64, "base64");

    // exifr.gps() reads only the GPS IFD, so it's fast even on large images
    // and returns null (not an error) when no GPS data is present.
    const gps = await exifr.gps(buffer);

    return Response.json({
      dropbox_file_id: file.id,
      modified_time: file.client_modified,
      status: "success",
      latitude: gps?.latitude ?? null,
      longitude: gps?.longitude ?? null,
    });
  } catch (err) {
    console.error("EXIF extraction error:", err);
    return Response.json(
      {
        dropbox_file_id: file.id,
        modified_time: file.client_modified,
        status: "failed",
        latitude: null,
        longitude: null,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
