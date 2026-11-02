# byt-watchdog

> L1 — stable operating manual. Sprint state → `docs/state.md`. Product ref → `docs/documentation.md`.
> Test spec → `docs/test-documentation.md`. Terms → `docs/glossary.md`.

## Boundary Rule
**NEVER edit files outside `apps/byt-watchdog/`.** `apps/job-scraper` was the pattern source (copied code, read-only).
- Proactively update `docs/state.md` after every completed milestone.

## Scope
- Editable: everything inside `apps/byt-watchdog/`.

## Read This When Needed
- `docs/glossary.md` — domain terms (MČ, poplatky, seed run …) — **read first on any non-trivial task**
- `docs/state.md` — current status, blockers, next steps (L2)
- `docs/documentation.md` — features, portal API notes, dedupe/Actions design, decisions (L3)
- `docs/test-documentation.md` — test matrix and evidence (L3)

## Project Summary
- **Type:** headless CLI / scheduled job (no UI).
- **Primary goal:** poll Czech rental portals for new Praha flats matching `config/filters.mjs` and push each new match once via ntfy.
- **Deployment target:** GitHub Actions cron (`.github/workflows/watch.yml`) in a public repo; not published yet.

## Stack
- **Runtime:** Node.js 20+, plain ESM `.mjs`, built-in `fetch`, `node:test`.
- **Dependencies:** none. Do not add any (no npm install). If something truly needs a dependency, skip it and document it.
- **Notifications:** ntfy JSON publish API (`NTFY_TOPIC` env, optional `NTFY_SERVER`, https only).

## Commands
```bash
npm run dry-run       # live portals, prints would-be alerts, never sends, does not save state
npm start             # live mode if NTFY_TOPIC is set, else dry-run
node src/index.mjs --portal sreality,bezrealitky   # subset of portals
node src/index.mjs --dry-run --save-state --state /tmp/seen.json   # dry-run that persists dedupe
npm run test          # unit tests (node:test, offline)
npm run verify:quick  # syntax + import check of every .mjs
npm run verify        # verify:quick + tests
```

## Architecture
```text
config/filters.mjs   # THE filter config (dispositions, areas, price rule, portal knobs)
src/
├── index.mjs        # CLI entry: args, mode, state load/save, summary
├── run.mjs          # core loop: prefilter → dedupe → enrich → price rule → deliver
├── match.mjs        # area resolution, prefilter, price rule
├── fees.mjs         # poplatky parser for free text
├── alert.mjs        # Czech alert text
├── notify.mjs       # ntfy publish + dry-run printer
├── state.mjs        # state/seen.json load/save/prune
├── http.mjs         # fetch with per-host rate limit + retries (from job-scraper)
└── portals/         # sreality.mjs, bezrealitky.mjs, idnes.mjs
test/                # offline unit tests
scripts/check-syntax.mjs
.github/workflows/watch.yml
```

## Workflow Rules
- Run `npm run verify` before every commit (there is no TypeScript; verify = syntax/import check + tests).
- Never commit secrets, `.env`, or `state/` (local seen.json). `NTFY_TOPIC` only from env / Actions secret.
- Never send a real ntfy notification while developing: use `--dry-run` (default when `NTFY_TOPIC` is unset).
- Live portal probes: few requests, keep per-host `minIntervalMs`, no login, no captcha bypass.
- Czech text with real UTF-8 diacritics, never `\uXXXX` escapes.

## Project-Specific Rules
- Filters live only in `config/filters.mjs`; portal modules read them, never hardcode thresholds.
- Every portal module exports `name`, `search(config, log)` and optionally `enrich(listing, config)`, and returns normalized listings (shape in `docs/documentation.md § Listing shape`).
- Area matching goes through `resolveArea()`; do not add per-portal district logic elsewhere.
- stdout = alerts (dry-run) + one summary line; progress and warnings → stderr.

## Gotchas
- Sreality `/api/cs/v2/estates` is dead (404). Use `/api/v1/estates/search` + `/api/v1/estates/<id>`.
- Sreality districts are old okresy: `5004` (Praha 4) also contains Praha 11, 12, Kunratice, Libuš…; the real MČ is `locality.quarter`.
- iDNES card locality is the postal district ("Praha 4 - Modřany"); the URL slug has the MČ (`praha-12-…`) but may still lump small MČ (Šeberov under `praha-11`) → `excludeQuarters`.
- Bezrealitky `charges: 0` means "not filled", treated as unknown fees.
- First live run without `state/seen.json` is a **seed run**: records current matches silently (no alert flood). `--no-seed` disables that.
- GitHub cron is best-effort and scheduled workflows in public repos are auto-disabled after 60 days without repo activity.

## Docs Separation
- **L1** `CLAUDE.md` — this file
- **L2** `docs/state.md` — status, blockers, next steps
- **L3** `docs/documentation.md` — features, decisions, portal notes
- **L3** `docs/test-documentation.md` — coverage + evidence
- **Companion** `docs/glossary.md`
