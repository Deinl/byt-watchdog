# Glossary — byt-watchdog

> Project terms and conventions. Builders/reviewers read §1 first.

---

## §1 Core (always-read)

### Conventions
- **Money** — integer CZK per month. `rent` = nájemné, `fees` = poplatky (number, `0` = included in rent, `null` = unknown).
- **Price rule** — fees known: `rent + fees <= price.maxTotalWithFees` (17 000). Fees unknown: `rent <= price.maxRentFeesUnknown` (15 000) and the alert says "poplatky neuvedeny – ověř".
- **Listing key** — `<portal>:<portal id>`, the dedupe key in `state/seen.json`.
- **Disposition labels** — normalized to `garsonka`, `1+kk`, `1+1` across portals.
- **Area** — one of the configured MČ names (`"Praha 4"` …) resolved by `resolveArea()`; `null` = outside or undecidable (rejected).
- **Alert text** — Czech with real diacritics: `Nový byt: <disp> (<m²>), <MČ> – <quarter>, <price>[, <furnished>]` + URL.

### Anti-patterns
- **Trusting "Praha 4" from a portal** — usually the old okres / postal district, which also contains Praha 11, 12, Kunratice, Libuš. Use MČ data (`quarter`, iDNES slug) + `excludeQuarters`.
- **Treating 0 fees as known** — Bezrealitky stores an empty fee field as `0`; it means unknown.
- **Re-alerting on price change** — `alertedAt` survives price changes; a listing alerts at most once.

---

## §2 On-demand

### Domain terms
- **MČ (městská část)** — Prague municipal district (Praha 1–22 plus small ones like Praha-Kunratice). Filter target.
- **Okres / správní obvod / postal district** — older or administrative groupings with the same "Praha N" names but larger areas; portals mix them up.
- **Katastrální území (quarter)** — cadastral area (Nusle, Krč, Vinohrady …); some are split between MČ, see `quartersNeedingZip`.
- **Poplatky / zálohy / služby** — monthly fees on top of rent (utilities, building services).
- **Zařízený / částečně / nezařízený** — furnished / partially / unfurnished (`furnished`: `yes` / `partial` / `no` / `null`).

### Technical terms
- **Seed run** — first live run with no `state/seen.json`: records all current matches with `alertedAt: "seeded"`, sends nothing.
- **Enrich** — per-listing detail fetch (Sreality only) for fees + furnishing; capped by `maxDetailsPerRun` except on a seed run.
- **Fingerprint** — `disposition|rent|m²|quarter`; same fingerprint already alerted → `alertedAt: "duplicate:<key>"` (cross-portal dedupe).
- **Deferred** — matches or details postponed to the next run by `maxAlertsPerRun` / `maxDetailsPerRun`.

### Acronyms
- **RK** — realitní kancelář (real-estate agency).
- **SVJ** — společenství vlastníků jednotek (owners' association; fees often mention it).
