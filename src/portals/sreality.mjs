// Sreality.cz — public JSON API used by the site frontend.
// NOTE: the old /api/cs/v2/estates endpoint returns 404 (verified 2026-11-02);
// the current one is /api/v1/estates/search (list) and /api/v1/estates/<id> (detail).

import { parseFees } from "../fees.mjs";
import { fetchJson } from "../http.mjs";
import { resolveArea } from "../match.mjs";

const BASE = "https://www.sreality.cz/api/v1/estates";
const MONTHLY_UNIT = 2; // price_unit_cb 2 = "za měsíc"
const SUB_TO_DISPOSITION = { 2: "1+kk", 3: "1+1" };
const FURNISHED = { 1: "yes", 2: "no", 3: "partial" };

export const name = "sreality";

export function buildSearchUrl(pc, offset, config) {
  const params = new URLSearchParams({
    category_main_cb: "1",
    category_type_cb: "2",
    category_sub_cb: pc.subCategories.join(","),
    locality_district_id: pc.districtIds.join(","),
    price_to: String(config.price.maxTotalWithFees),
    limit: String(pc.pageLimit),
    offset: String(offset),
    sort: "-date",
    lang: "cs",
  });
  return `${BASE}/search?${params}`;
}

function slug(...parts) {
  return parts.filter(Boolean).join("-") || "praha";
}

/** Map one search result to a normalized listing (or null when unusable). */
export function normalize(r, config) {
  const disposition = SUB_TO_DISPOSITION[r?.category_sub_cb?.value];
  if (!disposition || !r.hash_id) return null;
  if (r.price_unit_cb && r.price_unit_cb.value !== MONTHLY_UNIT) return null;
  const loc = r.locality ?? {};
  const quarter = loc.citypart || loc.ward || null;
  const areaName = resolveArea({ mc: loc.quarter, quarter, zip: loc.zip }, config);
  const sub = encodeURIComponent(disposition).replace("%2B", "+");
  const size = String(r.advert_name ?? "").match(/(\d+)\s*m²/);
  return {
    key: `sreality:${r.hash_id}`,
    portal: name,
    id: String(r.hash_id),
    url: `https://www.sreality.cz/detail/pronajem/byt/${sub}/${slug(loc.city_seo_name, loc.citypart_seo_name, loc.street_seo_name)}/${r.hash_id}`,
    disposition,
    rent: Number(r.price_czk),
    fees: undefined,
    furnished: null,
    areaName,
    quarter,
    sizeM2: size ? Number(size[1]) : null,
    needsDetail: true,
  };
}

export async function search(config, log) {
  const pc = config.portals.sreality;
  const out = [];
  let total = Infinity;
  for (let page = 0; page < pc.maxPages && page * pc.pageLimit < total; page++) {
    const data = await fetchJson(buildSearchUrl(pc, page * pc.pageLimit, config), {
      minIntervalMs: pc.minIntervalMs,
    });
    if (!Array.isArray(data?.results)) throw new Error("Sreality: unexpected search response shape");
    total = Number(data.pagination?.total ?? 0);
    for (const r of data.results) {
      const l = normalize(r, config);
      if (l) out.push(l);
    }
    if (data.results.length < pc.pageLimit) break;
  }
  log(`sreality: ${out.length} results (API total ${total})`);
  return out;
}

/** Detail -> fees + furnished. Mutates and returns the listing. */
export function applyDetail(listing, detail) {
  const d = detail?.result;
  if (!d) throw new Error("Sreality: unexpected detail response shape");
  const rent = Number(d.price_czk ?? listing.rent);
  if (Number.isFinite(rent) && rent > 0) listing.rent = rent;
  let fees = parseFees(d.price_note, listing.rent);
  if (fees === null) fees = parseFees(d.cost_of_living, listing.rent);
  if (fees === null) fees = parseFees(d.advert_description, listing.rent);
  listing.fees = fees;
  listing.furnished = FURNISHED[d.furnished?.value] ?? null;
  const area = Number(d.usable_area);
  if (Number.isFinite(area) && area > 0) listing.sizeM2 = area;
  listing.needsDetail = false;
  return listing;
}

export async function enrich(listing, config) {
  const detail = await fetchJson(`${BASE}/${listing.id}?lang=cs`, {
    minIntervalMs: config.portals.sreality.minIntervalMs,
  });
  return applyDetail(listing, detail);
}
