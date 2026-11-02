# byt-watchdog — Test Documentation

> L3 — test spec + coverage evidence.

Last updated: 2026-11-02
Updated by: builder

## Test Architecture
- **L1 Functional:** `node:test` unit tests in `test/` (offline, fixtures inline). `npm run verify` = syntax/import check of all `.mjs` + tests.
- **L2 Security:** topic/server validation tests; no secrets in repo; https-only ntfy.
- **L3 SEO/a11y:** N/A (no UI).

## Feature Coverage Overview

| Feature | L1 Functional | L2 Security | Notes |
|---------|---------------|-------------|-------|
| Fee parsing (`fees.mjs`) | Covered | N/A | real Sreality `price_note` sample |
| Area resolution (`match.mjs`) | Covered | N/A | MČ, quarter+ZIP, ambiguous, excluded MČ |
| Price rule / prefilter | Covered | N/A | 17 000 / 15 000 boundaries |
| Alert text | Covered | N/A | exact Czech strings |
| Sreality normalize/detail | Covered | N/A | fixture from live response |
| Bezrealitky normalize | Covered | N/A | fixture from live response |
| iDNES card parsing | Covered | N/A | synthetic cards mirroring live markup |
| Run loop dedupe / seed / retry / caps / cross-portal | Covered | N/A | fake portals |
| State save/load/prune | Covered | N/A | temp dir |
| ntfy send | None | Partial | validation only; no real send by policy |
| Live portal contract | Manual | N/A | see manual evidence |

## Critical Path Matrix

| Area | Risk | L1 | Status | Gaps |
|------|------|----|--------|------|
| Dedupe (no repeat alerts) | High | Covered | Partial | Actions cache path not run yet |
| Price/area filter | High | Covered | Ready | — |
| Portal markup/API drift | Medium | Manual | At Risk | no scheduled contract check; failures only logged |
| ntfy delivery | Medium | None | Untested | first real send pending Dan |

## Recent automated evidence

| Date | Commit | Command | Scope | Result |
|------|--------|---------|-------|--------|
| 2026-11-02 | initial | `npm run verify` | 15 files, 27 tests | PASS |

## Recent manual evidence

| Date | Tester | Environment | Scenario | Result |
|------|--------|-------------|----------|--------|
| 2026-11-02 | builder | WSL, live portals | `--dry-run --save-state` fresh state | sreality 94 results / 21 matched, bezrealitky 83 / 7, idnes 75 / 8; 31 would-alert, 5 cross-portal dups, 9 details deferred |
| 2026-11-02 | builder | WSL, live portals | second dry-run on same state | 1 new alert (a previously deferred detail), 0 repeats |

## Known testing gaps
1. Workflow (cache restore/save, secret) never executed — needs the published repo.
2. Real ntfy publish untested.
3. Seed run without detail cap verified by unit test only (live runs were done before that change).
