/**
 * upload.ts — copies a staged tree from .tmp/staging/ to Dropbox
 * --------------------------------------------------------------
 * Uploads every file under .tmp/staging/wonderway rag/<subpath> to the same
 * path in Dropbox, overwriting. Refuses any destination that isn't inside a
 * "_" folder (staging/review areas the ingest ignores), so this can never
 * publish content by itself: going live is always a manual rename.
 *
 * Usage:
 *   npx tsx app/scripts/sources/upload.ts "places/_frick" "_library"
 *   npx tsx app/scripts/sources/upload.ts "places/_frick" --dry-run
 */
import "dotenv/config";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Dropbox } from "dropbox";
import { isIgnoredPath } from "~/utils/ragIngest/ignored.path";

const STAGE_ROOT = join(process.cwd(), ".tmp", "staging", "wonderway rag");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const subpaths = args.filter((a) => !a.startsWith("--"));
if (subpaths.length === 0) {
  console.error('usage: npx tsx app/scripts/sources/upload.ts "places/_frick" ["_library"] [--dry-run]');
  process.exit(1);
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dbx = new Dropbox({
    clientId: process.env.DROPBOX_APP_KEY,
    clientSecret: process.env.DROPBOX_APP_SECRET,
    refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
  });

  const files = subpaths.flatMap((sub) => listFiles(join(STAGE_ROOT, sub)));
  const targets = files.map((f) => ({
    local: f,
    remote: `/wonderway rag/${relative(STAGE_ROOT, f).split("\\").join("/")}`,
  }));

  const unsafe = targets.filter((t) => !isIgnoredPath(t.remote.toLowerCase()));
  if (unsafe.length) {
    throw new Error(
      `Refusing to upload outside a "_" folder (would be ingested):\n  ${unsafe.slice(0, 5).map((t) => t.remote).join("\n  ")}`,
    );
  }

  console.log(`[upload] ${targets.length} files${dryRun ? " (dry run)" : ""}`);
  if (dryRun) {
    targets.slice(0, 20).forEach((t) => console.log("  ", t.remote));
    return;
  }

  let done = 0;
  for (const t of targets) {
    for (let attempt = 1; ; attempt++) {
      try {
        await dbx.filesUpload({
          path: t.remote,
          contents: readFileSync(t.local),
          mode: { ".tag": "overwrite" },
          mute: true,
        });
        break;
      } catch (err: unknown) {
        const e = err as { status?: number; error?: { error?: { retry_after?: number } } };
        const retryAfter = e.error?.error?.retry_after;
        if ((e.status === 429 || e.status === 503) && attempt < 6) {
          const wait = (retryAfter ?? 2 ** attempt) * 1000;
          console.warn(`[upload] rate limited, retry in ${wait / 1000}s`);
          await sleep(wait);
          continue;
        }
        throw new Error(`upload ${t.remote}: ${String((err as Error)?.message ?? err)}`);
      }
    }
    if (++done % 50 === 0) console.log(`[upload] ${done}/${targets.length}`);
  }
  console.log(`[upload] done: ${done} files`);
}

main().catch((err) => {
  console.error("[upload] stopped:", err);
  process.exit(1);
});
