# byt-watchdog — Project State

> L2 — sprint living doc. Short-term only.

Last updated: 2026-11-03

## 🔒 Dan's Notes — OWNER: Dan ONLY (agents: read-only)
<!-- HARD RULE — agents NEVER touch this section. ONLY Dan edits it, by hand. -->
- _(Dan's personal thoughts / observations go here — hand-written, agent-untouched.)_

---

## Core todos
- (none)

---

## Last Session — 2026-11-03
- **Branch:** master, pushed to public repo `Deinl/byt-watchdog`
- **What was done:** published repo, set `NTFY_TOPIC` Actions secret, sent one test push (HTTP 200), ran first `workflow_dispatch` = seed run (sreality 24, bezrealitky 6, idnes 7 matched; 30 seeded, 7 cross-portal dupes).
- **In progress:** nothing
- **Blockers:** none
- **Next steps:** watch first days of real alerts; tune filters on false positives; bump Actions to Node 24 versions (deprecation warning).

## Critical / Blockers
(none)

## Status Overview
Live: GitHub Actions cron every 10 min, alerts via ntfy. Topic stored outside the repo for Dan.

## Sprint Phase
Phase: S0 — MVP

## Active Backlog
- P1: Watch first days of alerts; tune `excludeQuarters` / fee parsing on false positives.
- P2: UlovDomov portal (map its client API).
- P2: iDNES detail fetch for 15 001–17 000 listings to learn fees.

## What's Mock / Incomplete
- iDNES: fees and furnishing never known.

## What's Broken / Blocked
- (none known)

## Sprint-scope Key Decisions
- Dedupe state via actions/cache, not commit-back (see documentation.md § Dedupe persistence).

## Open Questions
- Does Dan want quiet hours (no pushes at night)?

## Cross-references
- `CLAUDE.md` — L1
- `docs/documentation.md` — L3
- `docs/test-documentation.md` — L3
- `docs/glossary.md`
