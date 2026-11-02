// Filter logic: area resolution, disposition and the price rule.

const norm = (s) =>
  String(s ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** "Praha 4", "praha-4", "Praha4" -> "Praha 4"; anything else -> null */
export function normalizeMc(value) {
  const m = String(value ?? "").match(/^\s*praha[\s-]*(\d{1,2})\s*$/i);
  return m ? `Praha ${Number(m[1])}` : null;
}

/**
 * Decide which configured area a listing belongs to.
 * @param {{mc?: string|null, quarter?: string|null, zip?: string|null}} loc
 * @param {object} config
 * @returns {string|null} area name ("Praha 4") or null when outside / undecidable
 */
export function resolveArea(loc, config) {
  const qn = norm(String(loc.quarter ?? "").replace(/^praha\s*[-–]\s*/i, ""));
  if (qn && (config.excludeQuarters ?? []).some((x) => norm(x) === qn)) return null;
  const mc = normalizeMc(loc.mc);
  if (mc) return config.areas.some((a) => a.name === mc) ? mc : null;
  // A quarter given as "Praha 12" is also an MČ.
  const quarterMc = normalizeMc(loc.quarter);
  if (quarterMc) return config.areas.some((a) => a.name === quarterMc) ? quarterMc : null;

  const q = norm(loc.quarter);
  if (!q) return null;
  const candidates = config.areas.filter((a) => a.quarters.some((x) => norm(x) === q));
  if (candidates.length === 0) return null;
  const needsZip = config.quartersNeedingZip.some((x) => norm(x) === q);
  const zip = String(loc.zip ?? "").replace(/\s/g, "");
  if (zip.length >= 3) {
    const prefix = zip.slice(0, 3);
    const byZip = candidates.filter((a) => a.zips.includes(prefix));
    if (byZip.length > 0) return byZip[0].name;
    // ZIP contradicts every candidate: trust an unambiguous quarter, reject a shared one.
    return !needsZip && candidates.length === 1 ? candidates[0].name : null;
  }
  return !needsZip && candidates.length === 1 ? candidates[0].name : null;
}

/** Cheap pre-filter that needs no detail fetch. */
export function prefilter(listing, config) {
  if (!config.dispositions.includes(listing.disposition)) return { ok: false, reason: "disposition" };
  if (!Number.isFinite(listing.rent) || listing.rent <= 0) return { ok: false, reason: "price" };
  if (listing.rent > config.price.maxTotalWithFees) return { ok: false, reason: "price" };
  if (!listing.areaName) return { ok: false, reason: "area" };
  return { ok: true };
}

/**
 * Price rule on a (possibly enriched) listing.
 * @returns {{ok: boolean, feesKnown: boolean, total: number|null}}
 */
export function priceRule(listing, config) {
  const { maxTotalWithFees, maxRentFeesUnknown } = config.price;
  if (Number.isFinite(listing.fees) && listing.fees !== null) {
    const total = listing.rent + listing.fees;
    return { ok: total <= maxTotalWithFees, feesKnown: true, total };
  }
  return { ok: listing.rent <= maxRentFeesUnknown, feesKnown: false, total: null };
}
