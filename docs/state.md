# byt-watchdog — Project State

> L2 — sprint living doc. Short-term only.

Last updated: 2026-11-02

## 🔒 Dan's Notes — OWNER: Dan ONLY (agents: read-only)
<!-- HARD RULE — agents NEVER touch this section. ONLY Dan edits it, by hand. -->
- _(Dan's personal thoughts / observations go here — hand-written, agent-untouched.)_

---

## Core todos
- (none)

---

## Last Session — 2026-11-02
- **Branch:** feature/initial-watchdog (new local repo, no remote, `master` still unborn)
- **What was done:** initial build — Sreality + Bezrealitky + iDNES, filters config, dedupe state, ntfy + dry-run, Actions workflow, tests.
- **In progress:** nothing
- **Blockers:** none
- **Next steps:** Dan publishes the repo, adds `NTFY_TOPIC` secret, runs `workflow_dispatch` once (seed run), then watches alerts.

## Critical / Blockers
(none)

## Status Overview
Works locally in dry-run against live portals; not deployed.

## Sprint Phase
Phase: S0 — MVP

## Active Backlog
- P1: Publish repo + secret + first manual dispatch (Dan).
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
