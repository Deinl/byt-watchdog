// Fetch helper adapted from apps/job-scraper/src/utils.ts (copied, not imported):
// per-host rate limit stamped AFTER each fetch, retries on 5xx/429, abort timeout, body size cap.

export const USER_AGENT =
  "Mozilla/5.0 (compatible; byt-watchdog/0.1; personal rental alerts, low request rate)";

const MAX_BODY_BYTES = 4 * 1024 * 1024;

export class FetchError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message, { cause });
    this.name = "FetchError";
    this.status = status;
  }
}

const lastFetchByHost = new Map();

async function waitRateLimit(hostname, minIntervalMs) {
  const last = lastFetchByHost.get(hostname);
  if (last === undefined) return;
  const elapsed = Date.now() - last;
  if (elapsed < minIntervalMs) {
    await new Promise((r) => setTimeout(r, minIntervalMs - elapsed));
  }
}

/**
 * @param {string} url
 * @param {{method?: string, body?: string, headers?: Record<string,string>,
 *          timeoutMs?: number, maxRetries?: number, minIntervalMs?: number}} [opts]
 * @returns {Promise<{status: number, body: string, url: string}>}
 */
export async function fetchText(url, opts = {}) {
  const {
    method = "GET",
    body,
    headers = {},
    timeoutMs = 20000,
    maxRetries = 3,
    minIntervalMs = 1500,
  } = opts;
  const { hostname } = new URL(url);
  let lastErr;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
    await waitRateLimit(hostname, minIntervalMs);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        body,
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "cs,en;q=0.8",
          ...headers,
        },
      });
      if (!res.ok) {
        lastErr = new FetchError(`HTTP ${res.status} for ${url}`, { status: res.status });
        if (res.status >= 500 || res.status === 429) continue;
        throw lastErr;
      }
      const ab = await res.arrayBuffer();
      if (ab.byteLength > MAX_BODY_BYTES) {
        throw new FetchError(`Response body too large (${ab.byteLength} B) for ${url}`);
      }
      return { status: res.status, body: new TextDecoder().decode(ab), url: res.url };
    } catch (err) {
      if (err instanceof FetchError && err.status !== undefined && err.status < 500 && err.status !== 429) {
        throw err;
      }
      if (err instanceof FetchError && err.status === undefined) throw err;
      lastErr = err;
    } finally {
      clearTimeout(timer);
      lastFetchByHost.set(hostname, Date.now());
    }
  }
  throw new FetchError(
    `Fetch ${url} failed after ${maxRetries} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    { status: lastErr instanceof FetchError ? lastErr.status : undefined, cause: lastErr },
  );
}

export async function fetchJson(url, opts = {}) {
  const res = await fetchText(url, {
    ...opts,
    headers: { Accept: "application/json", ...(opts.headers ?? {}) },
  });
  try {
    return JSON.parse(res.body);
  } catch (err) {
    throw new FetchError(`Invalid JSON from ${url}`, { cause: err });
  }
}
