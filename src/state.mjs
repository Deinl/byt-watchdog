// Dedupe state: state/seen.json. Written atomically (tmp file + rename).
//
// Shape:
// { "version": 1, "updatedAt": ISO,
//   "listings": { "<portal>:<id>": { firstSeen, lastSeen, rent, fees, furnished, matched, alertedAt } } }
// `alertedAt` is an ISO time, "seeded" (silently marked on the very first live run) or null.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const STATE_VERSION = 1;

export async function loadState(path) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return { state: emptyState(), existed: false };
    throw err;
  }
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.version !== STATE_VERSION || typeof parsed.listings !== "object") {
    throw new Error(`Unsupported state file format in ${path}`);
  }
  return { state: parsed, existed: true };
}

export function emptyState() {
  return { version: STATE_VERSION, updatedAt: null, listings: {} };
}

/** Drop entries not seen in any search for `days` days. Returns number removed. */
export function pruneState(state, days, now = new Date()) {
  const cutoff = now.getTime() - days * 86_400_000;
  let removed = 0;
  for (const [key, entry] of Object.entries(state.listings)) {
    if (Date.parse(entry.lastSeen) < cutoff) {
      delete state.listings[key];
      removed++;
    }
  }
  return removed;
}

export async function saveState(path, state, now = new Date()) {
  state.updatedAt = now.toISOString();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 1)}\n`, "utf8");
  await rename(tmp, path);
}
