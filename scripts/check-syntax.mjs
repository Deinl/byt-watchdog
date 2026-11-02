// Zero-dependency static check: `node --check` every .mjs file in the repo
// and verify every module imports cleanly (catches typos in import names).

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set(["node_modules", ".git", "state"]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name)) return [];
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".mjs") ? [p] : [];
  });
}

const files = walk(root);
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
  if (r.status !== 0) {
    failed++;
    process.stderr.write(`syntax error: ${relative(root, f)}\n${r.stderr}\n`);
  }
}
// Import-link check for library modules (not entry points or tests, which have side effects).
for (const f of files.filter((p) => /[\\/](src|config)[\\/]/.test(p) && !p.endsWith("index.mjs"))) {
  try {
    await import(pathToFileURL(f).href);
  } catch (err) {
    failed++;
    process.stderr.write(`import failed: ${relative(root, f)}: ${err.message}\n`);
  }
}
if (failed) {
  process.stderr.write(`check-syntax: ${failed} problem(s)\n`);
  process.exit(1);
}
process.stdout.write(`check-syntax: ${files.length} files OK\n`);
