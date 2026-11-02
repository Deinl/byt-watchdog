// Extract monthly fees (poplatky / zálohy / služby / energie) from free Czech text.
// Returns a number (CZK, 0 = explicitly included in rent) or null when unknown.

const AMOUNT_RE = /(\d{1,3}(?:[  .]\d{3})+|\d{3,6})\s*(?:,-|,–|,—)?\s*(?:Kč|CZK|kč|,-)/g;
const FEE_KW = /(poplat|služ|záloh|energi|elektř|plyn|vod[auyě]|topen|teplo|správ|fond oprav|svj|náklad|internet|odpad)/i;
const EXCLUDE_KW = /(kauc|depozit|jistot|proviz|vratn|prodej|celkem|celková cena|nájem\s*:?$|nájemné\s*:?$)/i;
const INCLUDED_RE = /(včetně|vč\.?|vc\.?)\s*(všech\s*)?(poplatk|služeb|energi|záloh|inkasa)/i;
const MIN_FEE = 100;
const MAX_FEE = 12000;

function toNumber(raw) {
  return Number(raw.replace(/[  .]/g, ""));
}

/**
 * @param {string | null | undefined} text
 * @param {number} rent  monthly rent, used to ignore the rent amount itself
 * @returns {number | null}
 */
export function parseFees(text, rent) {
  if (!text || typeof text !== "string") return null;
  const found = new Set();
  for (const m of text.matchAll(AMOUNT_RE)) {
    const value = toNumber(m[1]);
    if (!Number.isFinite(value) || value < MIN_FEE || value > MAX_FEE || value === rent) continue;
    const start = m.index;
    const end = start + m[0].length;
    const before = text.slice(Math.max(0, start - 40), start).split(/[.;!\n+]/).pop() ?? "";
    const plusBefore = /\+\s*$/.test(text.slice(Math.max(0, start - 4), start));
    const after = (text.slice(end, end + 30).split(/[.;!\n+(]/)[0] ?? "");
    const ctx = `${before} ${after}`;
    if (EXCLUDE_KW.test(before.trim()) || /kauc|depozit|jistot|proviz|vratn/i.test(after)) continue;
    if (plusBefore || FEE_KW.test(ctx)) found.add(value);
  }
  if (found.size > 0) return [...found].reduce((a, b) => a + b, 0);
  if (INCLUDED_RE.test(text)) return 0;
  return null;
}
