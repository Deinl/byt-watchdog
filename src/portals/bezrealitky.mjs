// Bezrealitky.cz — public GraphQL API (https://api.bezrealitky.cz/graphql/).
// List results already carry fees (charges) and furnishing (equipped), no detail fetch needed.

import { fetchJson } from "../http.mjs";
import { resolveArea } from "../match.mjs";

const ENDPOINT = "https://api.bezrealitky.cz/graphql/";
const DISPOSITION = { GARSONIERA: "garsonka", DISP_1_KK: "1+kk", DISP_1_1: "1+1" };
const FURNISHED = { VYBAVENY: "yes", CASTECNE: "partial", NEVYBAVENY: "no" };

export const name = "bezrealitky";

export const QUERY = `query ListAdverts($offerType:[OfferType],$estateType:[EstateType],$disposition:[Disposition],$regionOsmIds:[ID],$limit:Int,$offset:Int,$order:ResultOrder,$priceTo:Int,$locale:Locale!){
  listAdverts(offerType:$offerType,estateType:$estateType,disposition:$disposition,regionOsmIds:$regionOsmIds,limit:$limit,offset:$offset,order:$order,priceTo:$priceTo){
    totalCount
    list{ id uri disposition price charges serviceCharges utilityCharges currency equipped surface
      address(locale:$locale) street city(locale:$locale) cityDistrict(locale:$locale) zip }
  }
}`;

/** "Praha - Žižkov" -> "Žižkov"; "Praha 4" stays "Praha 4". */
export function quarterFromCityDistrict(value) {
  const s = String(value ?? "").trim();
  const m = s.match(/^Praha\s*[-–]\s*(.+)$/);
  return m ? m[1].trim() : s || null;
}

export function normalize(a, config) {
  const disposition = DISPOSITION[a?.disposition];
  if (!disposition || !a.id || !a.uri) return null;
  if (a.currency && a.currency !== "CZK") return null;
  const quarter = quarterFromCityDistrict(a.cityDistrict);
  const areaName = resolveArea({ quarter, zip: a.zip }, config);
  const charges = Number(a.charges);
  return {
    key: `bezrealitky:${a.id}`,
    portal: name,
    id: String(a.id),
    url: `https://www.bezrealitky.cz/nemovitosti-byty-domy/${a.uri}`,
    disposition,
    rent: Number(a.price),
    // 0 / missing charges is treated as "not stated" (the portal uses 0 for empty field).
    fees: Number.isFinite(charges) && charges > 0 ? charges : null,
    furnished: FURNISHED[a.equipped] ?? null,
    areaName,
    quarter,
    sizeM2: Number(a.surface) || null,
    needsDetail: false,
  };
}

export async function search(config, log) {
  const pc = config.portals.bezrealitky;
  const out = [];
  let total = Infinity;
  for (let page = 0; page < pc.maxPages && page * pc.pageLimit < total; page++) {
    const body = JSON.stringify({
      operationName: "ListAdverts",
      query: QUERY,
      variables: {
        offerType: ["PRONAJEM"],
        estateType: ["BYT"],
        disposition: pc.dispositions,
        regionOsmIds: pc.regionOsmIds,
        priceTo: config.price.maxTotalWithFees,
        limit: pc.pageLimit,
        offset: page * pc.pageLimit,
        order: "TIMEORDER_DESC",
        locale: "CS",
      },
    });
    const data = await fetchJson(ENDPOINT, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      minIntervalMs: pc.minIntervalMs,
    });
    if (data?.errors?.length) {
      throw new Error(`Bezrealitky GraphQL error: ${String(data.errors[0]?.message).slice(0, 200)}`);
    }
    const res = data?.data?.listAdverts;
    if (!res || !Array.isArray(res.list)) throw new Error("Bezrealitky: unexpected response shape");
    total = Number(res.totalCount ?? 0);
    for (const a of res.list) {
      const l = normalize(a, config);
      if (l) out.push(l);
    }
    if (res.list.length < pc.pageLimit) break;
  }
  log(`bezrealitky: ${out.length} results (API total ${total})`);
  return out;
}
