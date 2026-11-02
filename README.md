# byt-watchdog

Zero-dependency Node 20 watchdog for Praha rental flats (Sreality, Bezrealitky, iDNES Reality).
New matches are pushed once via [ntfy](https://ntfy.sh).

## Local
```bash
npm run dry-run   # live portals, prints would-be alerts, sends nothing
npm run verify    # syntax check + unit tests
```
Filters: `config/filters.mjs`.

## GitHub Actions setup
1. Push this repo to GitHub (public is fine).
2. Settings → Secrets and variables → Actions → New secret `NTFY_TOPIC` (a long random topic name; anyone who knows it can read the alerts).
3. Subscribe to the same topic in the ntfy app.
4. Actions → byt-watchdog → Run workflow once. The first run is a silent seed run; later runs (every ~10 min) alert only on new listings.

Dedupe state (`state/seen.json`) lives in the Actions cache, not in git.
