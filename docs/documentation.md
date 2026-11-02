# byt-watchdog — Documentation

> L3 — features, portal notes, long-term decisions.

Last updated: 2026-11-02

## Features

| Feature | Status | Notes |
|---------|--------|-------|
| Sreality.cz search + detail (fees, furnished) | DONE | JSON API, verified live 2026-11-02 |
| Bezrealitky.cz search | DONE | GraphQL, fees + furnished in list, verified live |
| iDNES Reality search | DONE (list only) | HTML regex parse, fees always unknown |
| UlovDomov | TODO | see § Portals |
| Bazoš | NOT PLANNED | see § Portals |
| Area / disposition / price filter | DONE | `config/filters.mjs` |
| Dedupe per listing + cross-portal fingerprint | DONE | `state/seen.json` |
| ntfy push + `--dry-run` | DONE | real send never exercised during development |
| GitHub Actions cron | WRITTEN, NOT RUNNING | needs a published repo + `NTFY_TOPIC` secret |

## Run flow (`src/run.mjs`)
1. Each enabled portal `search()` → normalized listings. A failing portal is logged and skipped.
2. `prefilter`: disposition, area resolved, `rent <= maxTotalWithFees`.
3. Dedupe: listing already in state with the same rent → skip (or retry a failed/capped notification).
4. `enrich()` when the portal needs a detail (Sreality), capped per run.
5. `priceRule` → store `{rent, fees, furnished, matched, alertedAt}`.
6. New matches sorted furnished-first, cross-portal duplicates dropped, then delivered (ntfy or dry-run print), max `maxAlertsPerRun`.
7. Prune entries unseen for `pruneAfterDays`; save state atomically (live mode, or dry-run with `--save-state`).

## Listing shape
`{ key, portal, id, url, disposition, rent, fees, furnished, areaName, quarter, sizeM2, needsDetail }`
- `fees`: `undefined` = not fetched yet, `null` = unknown, number = known (0 = included).

## Portals

### Sreality.cz
- List: `GET https://www.sreality.cz/api/v1/estates/search?category_main_cb=1&category_type_cb=2&category_sub_cb=2,3&locality_district_id=5002,5004,5010&price_to=17000&limit=100&offset=0&sort=-date&lang=cs`
- Detail: `GET https://www.sreality.cz/api/v1/estates/<hash_id>?lang=cs` → `price_note`, `cost_of_living`, `advert_description` (fees parsed in that order), `furnished.value` (1 ano, 2 ne, 3 částečně).
- MČ = `locality.quarter` ("Praha 12"), quarter = `locality.citypart`.
- The old `/api/cs/v2/estates` returns 404. No garsonka category (garsonky are 1+kk).
- Public URL: `https://www.sreality.cz/detail/pronajem/byt/<disp>/<city>-<citypart>-<street>/<hash_id>` (verified 200).

### Bezrealitky.cz
- `POST https://api.bezrealitky.cz/graphql/` `listAdverts(offerType:[PRONAJEM], estateType:[BYT], disposition:[GARSONIERA,DISP_1_KK,DISP_1_1], regionOsmIds:["R435514"], priceTo, order:TIMEORDER_DESC)`.
- `charges` (= service + utility) as fees; `0` treated as unknown. `equipped`: VYBAVENY / CASTECNE / NEVYBAVENY.
- Location is only a cadastral quarter (`cityDistrict` "Praha - Háje") + ZIP → resolved via `areas[].quarters` / `zips`.
- Public URL: `https://www.bezrealitky.cz/nemovitosti-byty-domy/<uri>` (verified 200).

### iDNES Reality
- `GET https://reality.idnes.cz/s/pronajem/byty/do-17000-za-mesic/praha/?dispozice=1-kk%7C1-1`, next pages `?page=1&…` (0-based), newest first, 25 cards/page, 3 pages per run.
- Area from detail URL slug (`praha-12-…`), quarter from card text; `excludeQuarters` removes small MČ lumped into the slug.
- No fees / furnishing on the card → always the 15 000 rule. TODO (optional): fetch detail pages for 15 001–17 000 listings.

### UlovDomov — TODO
- Next.js client-rendered; `__NEXT_DATA__` holds only counts, listings come from an internal client API that was not mapped. Needs network inspection of the site's XHR before implementing; likely feasible without dependencies.

### Bazoš — not planned
- Free-text classifieds: disposition, fees and district are unstructured, many duplicates/spam. Low value vs. noise; would need heuristic text parsing.

## Dedupe persistence in GitHub Actions
- Chosen: **actions/cache** (`actions/cache/restore` + `actions/cache/save`), key `seen-v1-<run_id>-<attempt>`, restore prefix `seen-v1-` → newest cache wins. Workflow token is `contents: read`.
- Why not commit-back: ~100+ bot commits/day, needs `contents: write`, and the state is not worth versioning. Cache works in public repos; caches from the default branch are not writable by fork PRs.
- If the cache is evicted (7 days unused / 10 GB limit), the next run is a **seed run** — silently re-records current matches, so no alert flood; at worst a listing posted in that 10-minute window is missed.
- `concurrency: byt-watchdog` prevents overlapping runs racing on the cache.

## Key Decisions
- 2026-11-02 — Zero dependencies, plain Node 20 ESM (`fetch`, `node:test`, regex HTML parsing).
- 2026-11-02 — `fetchText` copied from `apps/job-scraper/src/utils.ts` pattern (per-host rate limit stamped after fetch, retry on 5xx/429, body cap), not imported.
- 2026-11-02 — Unknown fees are conservative (15 000 rule) even when the portal might mean "included".
- 2026-11-02 — ntfy via JSON publish (`POST https://ntfy.sh/` with `topic`) so Czech title/message need no header encoding.

## Long-term Roadmap
- UlovDomov portal; optional iDNES detail fetch for fees; quiet hours.
