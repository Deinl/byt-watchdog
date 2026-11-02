#!/usr/bin/env node
// byt-watchdog CLI.
//
//   node src/index.mjs                  # live when NTFY_TOPIC is set, otherwise dry-run
//   node src/index.mjs --dry-run        # never sends, prints would-be alerts to stdout
//   node src/index.mjs --portal sreality,bezrealitky
//   node src/index.mjs --state path/to/seen.json
//   node src/index.mjs --dry-run --save-state   # dry-run but persist dedupe state
//   node src/index.mjs --no-seed        # live first run (no state file) sends everything
//
// stdout: alerts (dry-run) + final one-line summary. stderr: progress / warnings.

import { resolve } from "node:path";
import { parseArgs } from "node:util";
import config from "../config/filters.mjs";
import { printDryRun, resolveServer, sendNtfy, validateTopic } from "./notify.mjs";
import * as bezrealitky from "./portals/bezrealitky.mjs";
import * as idnes from "./portals/idnes.mjs";
import * as sreality from "./portals/sreality.mjs";
import { runOnce } from "./run.mjs";
import { loadState, pruneState, saveState } from "./state.mjs";

const ALL_PORTALS = { sreality, bezrealitky, idnes };
const log = (msg) => process.stderr.write(`${msg}\n`);

async function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      "save-state": { type: "boolean", default: false },
      "no-seed": { type: "boolean", default: false },
      portal: { type: "string" },
      state: { type: "string", default: "state/seen.json" },
    },
  });

  const topicRaw = process.env.NTFY_TOPIC?.trim();
  const dryRun = values["dry-run"] || !topicRaw;
  const target = dryRun ? null : { topic: validateTopic(topicRaw), server: resolveServer(process.env.NTFY_SERVER) };

  const requested = values.portal ? values.portal.split(",").map((s) => s.trim()) : Object.keys(ALL_PORTALS);
  for (const p of requested) {
    if (!ALL_PORTALS[p]) throw new Error(`Unknown portal "${p}" (known: ${Object.keys(ALL_PORTALS).join(", ")})`);
  }
  const portals = requested.filter((p) => config.portals[p]?.enabled).map((p) => ALL_PORTALS[p]);

  const statePath = resolve(values.state);
  const { state, existed } = await loadState(statePath);
  const seed = !existed && !values["no-seed"];
  log(
    `mode=${dryRun ? "dry-run" : "live"} state=${existed ? "loaded" : "new"} seed=${seed} known=${Object.keys(state.listings).length}`,
  );

  const deliver = async (alert, _listing, { seeded }) => {
    if (dryRun) {
      printDryRun(alert, { seeded });
      return;
    }
    if (seeded) return;
    await sendNtfy(target, alert);
    await new Promise((r) => setTimeout(r, 400));
  };

  const summary = await runOnce({ config, portals, state, seed, deliver, log });
  const pruned = pruneState(state, config.pruneAfterDays);

  const allFailed = portals.length > 0 && Object.values(summary.portals).every((p) => !p.ok);
  if (!allFailed && (!dryRun || values["save-state"])) {
    await saveState(statePath, state);
    log(`state saved: ${statePath} (${Object.keys(state.listings).length} listings, pruned ${pruned})`);
  }
  for (const e of summary.errors) log(`warning: ${e}`);

  const perPortal = Object.entries(summary.portals)
    .map(([n, p]) => `${n}=${p.ok ? `${p.results}/${p.candidates}/${p.matched}` : "FAIL"}`)
    .join(" ");
  const sentLabel = dryRun ? "would-alert" : seed ? "seeded" : "sent";
  process.stdout.write(
    `summary (results/candidates/matched): ${perPortal} | ${sentLabel}=${summary.alerts.length} cross-portal-duplicates=${summary.duplicates} deferred=${summary.deferred}\n`,
  );
  if (allFailed) process.exitCode = 1;
}

main().catch((err) => {
  log(`fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
