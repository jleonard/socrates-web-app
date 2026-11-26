/**
 * Polite, cached HTTP for the source puller.
 *
 * - One request at a time per host, at least `minIntervalMs` apart.
 * - 429 / 503 / MediaWiki "maxlag": wait for Retry-After when given,
 *   otherwise back off exponentially (2s, 4s, 8s… capped at 5 minutes),
 *   up to MAX_ATTEMPTS. Then throw, so a run stops cleanly and the next run
 *   resumes from the cache.
 * - Every successful response is cached on disk under .tmp/source-cache/
 *   (gitignored), keyed by URL or an explicit key (e.g. a Wikipedia
 *   revision id), so re-running repeats no network calls for content that
 *   hasn't changed.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const USER_AGENT = "ResearchBot/0.1 (leonardalonsostudio@gmail.com)";

const CACHE_DIR = join(process.cwd(), ".tmp", "source-cache");
const MAX_ATTEMPTS = 6;
const MAX_BACKOFF_MS = 5 * 60_000;

/** Minimum gap between requests to the same host. */
const HOST_INTERVAL_MS: Record<string, number> = {
  "en.wikipedia.org": 1000,
  "query.wikidata.org": 2000,
  "www.wikidata.org": 1000,
  "archive.org": 1000,
  "commons.wikimedia.org": 1000,
  "upload.wikimedia.org": 1000,
  "thumb.wikimedia.org": 1000,
};
const DEFAULT_INTERVAL_MS = 1000;

const lastRequestAt = new Map<string, number>();
const hostQueues = new Map<string, Promise<unknown>>();

export const stats = { network: 0, cached: 0, retries: 0 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cachePath(key: string) {
  const hash = createHash("sha1").update(key).digest("hex");
  return join(CACHE_DIR, hash.slice(0, 2), `${hash}.json`);
}

/**
 * GETs `url` as text. `cacheKey` defaults to the URL; pass a key that
 * changes when the content changes (e.g. title + revision) for sources
 * whose URL stays the same. `cache: false` always fetches (used for
 * "what is the current revision" checks).
 */
export async function politeGet(
  url: string,
  opts: { cacheKey?: string; cache?: boolean; accept?: string } = {},
): Promise<string> {
  const key = opts.cacheKey ?? url;
  const useCache = opts.cache !== false;
  const file = cachePath(key);
  if (useCache && existsSync(file)) {
    stats.cached++;
    return (JSON.parse(readFileSync(file, "utf8")) as { body: string }).body;
  }

  const host = new URL(url).host;
  // serialize per host: each request waits for the previous one
  const previous = hostQueues.get(host) ?? Promise.resolve();
  const run = previous.then(() => fetchWithRetry(url, host, opts.accept)).then(String);
  hostQueues.set(
    host,
    run.catch(() => undefined),
  );
  const body = await run;

  if (useCache) {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({ url, key, fetched_at: new Date().toISOString(), body }),
    );
  }
  return body;
}

async function fetchWithRetry(
  url: string,
  host: string,
  accept?: string,
  binary = false,
): Promise<string | Buffer> {
  const interval = HOST_INTERVAL_MS[host] ?? DEFAULT_INTERVAL_MS;
  for (let attempt = 1; ; attempt++) {
    const wait = (lastRequestAt.get(host) ?? 0) + interval - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(host, Date.now());
    stats.network++;

    let res: Response | null = null;
    let networkError: unknown = null;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Api-User-Agent": USER_AGENT,
          ...(accept ? { Accept: accept } : {}),
        },
      });
    } catch (err) {
      networkError = err;
    }

    if (res?.ok && binary) return Buffer.from(await res.arrayBuffer());
    if (res?.ok) {
      const body = await res.text();
      // MediaWiki reports maxlag as HTTP 200 with an error body
      if (!body.includes('"code":"maxlag"')) return body;
    }

    const status = res?.status ?? 0;
    const retryable =
      networkError != null ||
      status === 429 ||
      status === 500 ||
      status === 503 ||
      status === 502 ||
      status === 504 ||
      res?.ok; // maxlag
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw new Error(
        `GET ${url} failed (${networkError ? String(networkError) : `HTTP ${status}`}) after ${attempt} attempt(s)`,
      );
    }

    const retryAfter = Number(res?.headers.get("retry-after"));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(2000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
    stats.retries++;
    console.warn(
      `[http] ${host} ${networkError ? "network error" : status === 200 ? "maxlag" : status}, retry ${attempt}/${MAX_ATTEMPTS - 1} in ${Math.round(backoff / 1000)}s`,
    );
    await sleep(backoff);
  }
}

/**
 * GETs `url` as bytes (images), cached on disk as a raw file next to the
 * JSON cache. Same per-host spacing and retries as politeGet.
 */
export async function politeGetBinary(url: string): Promise<Buffer> {
  const file = cachePath(url).replace(/\.json$/, ".bin");
  if (existsSync(file)) {
    stats.cached++;
    return readFileSync(file);
  }
  const host = new URL(url).host;
  const previous = hostQueues.get(host) ?? Promise.resolve();
  const run = previous.then(() => fetchWithRetry(url, host, undefined, true));
  hostQueues.set(host, run.catch(() => undefined));
  const body = (await run) as Buffer;
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, body);
  return body;
}

export async function politeJson<T>(
  url: string,
  opts: { cacheKey?: string; cache?: boolean; accept?: string } = {},
): Promise<T> {
  return JSON.parse(await politeGet(url, opts)) as T;
}
