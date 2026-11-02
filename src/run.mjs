// Core run loop, independent of CLI / process concerns so it can be tested with fake portals.

import { formatAlert } from "./alert.mjs";
import { prefilter, priceRule } from "./match.mjs";

const FURNISHED_RANK = { yes: 0, partial: 1, no: 2 };

/** Same disposition + rent + m² + quarter = same flat. Needs m², otherwise too loose. */
export function fingerprint(l) {
  if (!l.sizeM2 || !l.quarter) return null;
  const q = String(l.quarter).normalize("NFC").toLowerCase().trim();
  return `${l.disposition}|${l.rent}|${l.sizeM2}|${q}`;
}

/**
 * @param {object} ctx
 * @param {object} ctx.config
 * @param {Array<{name: string, search: Function, enrich?: Function}>} ctx.portals
 * @param {object} ctx.state            loaded dedupe state (mutated)
 * @param {boolean} ctx.seed            first live run: record matches without notifying
 * @param {(alert: object, listing: object) => Promise<void>} ctx.deliver
 * @param {(msg: string) => void} ctx.log
 * @param {Date} [ctx.now]
 */
export async function runOnce(ctx) {
  const { config, portals, state, seed, deliver, log } = ctx;
  const nowIso = (ctx.now ?? new Date()).toISOString();
  const summary = { portals: {}, candidates: 0, matched: 0, alerts: [], deferred: 0, duplicates: 0, errors: [] };
  const pending = [];
  let detailsUsed = 0;

  for (const portal of portals) {
    const ps = { ok: false, results: 0, candidates: 0, matched: 0, error: null };
    summary.portals[portal.name] = ps;
    let listings;
    try {
      listings = await portal.search(config, log);
      ps.ok = true;
      ps.results = listings.length;
    } catch (err) {
      ps.error = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${portal.name}: ${ps.error}`);
      log(`${portal.name}: FAILED – ${ps.error}`);
      continue;
    }
    // Seed run enriches everything, otherwise the deferred rest would alert as "new" next run.
    const maxDetails = seed ? Infinity : (config.portals[portal.name]?.maxDetailsPerRun ?? Infinity);

    for (const listing of listings) {
      if (!prefilter(listing, config).ok) continue;
      ps.candidates++;
      summary.candidates++;
      const prev = state.listings[listing.key];
      if (prev) prev.lastSeen = nowIso;
      // Already evaluated at this rent -> nothing to do (dedupe).
      if (prev && prev.rent === listing.rent) {
        if (prev.matched) {
          ps.matched++;
          summary.matched++;
          // Matched earlier but the notification failed / was capped -> retry from stored data.
          if (!prev.alertedAt) {
            if (listing.needsDetail) {
              listing.fees = prev.fees;
              listing.furnished = prev.furnished ?? null;
            }
            pending.push({ listing, price: priceRule(listing, config) });
          }
        }
        continue;
      }
      if (listing.needsDetail && portal.enrich) {
        if (detailsUsed >= maxDetails) {
          summary.deferred++;
          continue;
        }
        detailsUsed++;
        try {
          await portal.enrich(listing, config);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          summary.errors.push(`${portal.name} detail ${listing.id}: ${msg}`);
          continue; // not recorded -> retried next run
        }
        if (!prefilter(listing, config).ok) continue;
      }
      const price = priceRule(listing, config);
      state.listings[listing.key] = {
        firstSeen: prev?.firstSeen ?? nowIso,
        lastSeen: nowIso,
        rent: listing.rent,
        fees: listing.fees ?? null,
        furnished: listing.furnished ?? null,
        matched: price.ok,
        alertedAt: prev?.alertedAt ?? null,
      };
      if (!price.ok) continue;
      ps.matched++;
      summary.matched++;
      if (!state.listings[listing.key].alertedAt) pending.push({ listing, price });
    }
  }

  if (config.preferFurnished) {
    pending.sort(
      (a, b) => (FURNISHED_RANK[a.listing.furnished] ?? 1.5) - (FURNISHED_RANK[b.listing.furnished] ?? 1.5),
    );
  }

  // Cross-portal dedupe: the same flat is often listed on several portals.
  const alertedByFp = new Map();
  for (const [key, e] of Object.entries(state.listings)) {
    if (e.fp && e.alertedAt) alertedByFp.set(e.fp, key);
  }

  for (const { listing, price } of pending) {
    const entry = state.listings[listing.key];
    const fp = fingerprint(listing);
    entry.fp = fp;
    const dupOf = fp ? alertedByFp.get(fp) : undefined;
    if (dupOf && dupOf !== listing.key) {
      entry.alertedAt = `duplicate:${dupOf}`;
      summary.duplicates++;
      continue;
    }
    const alert = formatAlert(listing, price);
    if (seed) {
      entry.alertedAt = "seeded";
      if (fp) alertedByFp.set(fp, listing.key);
      summary.alerts.push({ ...alert, seeded: true, listing });
      await deliver(alert, listing, { seeded: true });
      continue;
    }
    if (summary.alerts.length >= config.maxAlertsPerRun) {
      summary.deferred++;
      continue; // stays un-alerted -> next run
    }
    try {
      await deliver(alert, listing, { seeded: false });
      entry.alertedAt = nowIso;
      if (fp) alertedByFp.set(fp, listing.key);
      summary.alerts.push({ ...alert, seeded: false, listing });
    } catch (err) {
      summary.errors.push(`notify ${listing.key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return summary;
}
