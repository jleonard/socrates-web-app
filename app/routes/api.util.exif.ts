import exifr from "exifr";
import type { ActionFunctionArgs } from "react-router";

const SHARED_SECRET = process.env.N8N_SHARED_SECRET!; // same secret used by the markdown endpoint

interface DropboxFile {
  id: string;
  name: string;
  dropbox_path: string;
  dropbox_file_id: string;
}

interface ExifPayload {
  file: DropboxFile;
  image_url: string; // Dropbox temporary link — this route fetches the bytes itself
}

export async function action({ request }: ActionFunctionArgs) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${SHARED_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: ExifPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { file, image_url } = payload;

  if (!file?.id) {
    return Response.json({ error: "Missing file.id" }, { status: 400 });
  }
  if (!image_url) {
    return Response.json({ error: "Missing image_url" }, { status: 400 });
  }

  try {
    // Fetch the image directly from Dropbox's temporary link rather than
    // relaying the full file through n8n as base64 — keeps the n8n → app
    // payload tiny regardless of image size, and avoids request-body
    // limits some hosts impose (e.g. Vercel's ~4.5MB default).
    const imageResponse = await fetch(image_url);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }
    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // exifr.gps() reads only the GPS IFD, so it's fast even on large images
    // and returns null (not an error) when no GPS data is present.
    const gps = await exifr.gps(buffer);

    return Response.json({
      id: file.id,
      dropbox_file_id: file.dropbox_file_id,
      status: "success",
      latitude: gps?.latitude ?? null,
      longitude: gps?.longitude ?? null,
    });
  } catch (err) {
    console.error("EXIF extraction error:", err);
    return Response.json(
      {
        id: file.id,
        dropbox_file_id: file.dropbox_file_id,
        status: "failed",
        latitude: null,
        longitude: null,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
