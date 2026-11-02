// iDNES Reality — server-rendered HTML listing parsed with regexes (no HTML parser dependency).
// Cards expose title (disposition + m²), locality text, rent and detail URL.
// The detail URL slug carries the real MČ ("praha-12-..."), while the locality text shows the
// postal district ("Praha 4 - Modřany"), so the slug wins for area matching.
// Fees and furnishing are not on the card -> fees stay unknown (rent <= maxRentFeesUnknown rule).

import { fetchText } from "../http.mjs";
import { resolveArea } from "../match.mjs";

export const name = "idnes";

const BASE = "https://reality.idnes.cz/s/pronajem/byty";
const CARD_RE =
  /<a[^>]+href="(https:\/\/reality\.idnes\.cz\/detail\/pronajem\/byt\/([a-z0-9-]+)\/([0-9a-f]{16,32})\/)"[\s\S]*?c-products__title">([\s\S]*?)<\/h2>[\s\S]*?c-products__info">([\s\S]*?)<\/p>[\s\S]*?c-products__price">([\s\S]*?)<\/p>/g;

const ENTITIES = { "&amp;": "&", "&nbsp;": " ", "&#39;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">" };

function text(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|nbsp|#39|quot|lt|gt);/g, (e) => ENTITIES[e])
    .replace(/[\s ]+/g, " ")
    .trim();
}

export function buildSearchUrl(page, config) {
  const max = config.price.maxTotalWithFees;
  const q = page > 0 ? `?page=${page}&dispozice=1-kk%7C1-1` : "?dispozice=1-kk%7C1-1";
  return `${BASE}/do-${max}-za-mesic/praha/${q}`;
}

/** Parse listing cards from one result page. */
export function parseCards(html, config) {
  const out = [];
  for (const m of html.matchAll(CARD_RE)) {
    const [, url, slugPart, id, titleHtml, infoHtml, priceHtml] = m;
    const title = text(titleHtml);
    const disp = title.match(/\b(1\+kk|1\+1)\b/i);
    if (!disp) continue;
    const priceText = text(priceHtml);
    const priceMatch = priceText.match(/^(\d{1,3}(?:[ .]\d{3})*)\s*Kč\s*\/\s*měs/i);
    if (!priceMatch) continue; // "Cena na vyžádání", per-m² prices etc.
    const info = text(infoHtml);
    const slugMc = slugPart.match(/^praha-(\d{1,2})-/);
    const infoQuarter = info.split(/\s+-\s+/).pop()?.trim() || null;
    const areaName = resolveArea(
      { mc: slugMc ? `Praha ${slugMc[1]}` : null, quarter: infoQuarter },
      config,
    );
    const size = title.match(/(\d+)\s*m²/);
    out.push({
      key: `idnes:${id}`,
      portal: name,
      id,
      url,
      disposition: disp[1].toLowerCase(),
      rent: Number(priceMatch[1].replace(/[ .]/g, "")),
      fees: null,
      furnished: null,
      areaName,
      quarter: infoQuarter,
      sizeM2: size ? Number(size[1]) : null,
      needsDetail: false,
    });
  }
  return out;
}

export async function search(config, log) {
  const pc = config.portals.idnes;
  const byKey = new Map();
  let cardsSeen = 0;
  for (let page = 0; page < pc.maxPages; page++) {
    const res = await fetchText(buildSearchUrl(page, config), {
      minIntervalMs: pc.minIntervalMs,
      headers: { Accept: "text/html" },
    });
    const cards = parseCards(res.body, config);
    if (page === 0 && cards.length === 0 && !res.body.includes("c-products__item")) {
      throw new Error("iDNES: no listing cards found — markup may have changed");
    }
    cardsSeen += cards.length;
    for (const c of cards) byKey.set(c.key, c);
    if (cards.length === 0) break;
  }
  log(`idnes: ${byKey.size} results (${cardsSeen} cards parsed)`);
  return [...byKey.values()];
}
