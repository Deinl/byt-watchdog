// Czech alert text.

const PORTAL_LABEL = {
  sreality: "Sreality",
  bezrealitky: "Bezrealitky",
  idnes: "iDNES Reality",
};

const FURNISHED_LABEL = {
  yes: "zařízený",
  partial: "částečně zařízený",
  no: "nezařízený",
};

/** 14500 -> "14 500 Kč" (regular space as thousands separator, stable across Node ICU builds). */
export function formatCzk(n) {
  return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} Kč`;
}

/**
 * @param {object} listing normalized + evaluated listing
 * @param {{feesKnown: boolean}} price
 * @returns {{title: string, message: string, click: string, tags: string[], line: string}}
 */
export function formatAlert(listing, price) {
  const where = listing.quarter && listing.quarter !== listing.areaName
    ? `${listing.areaName} – ${listing.quarter}`
    : listing.areaName;
  let priceText = formatCzk(listing.rent);
  if (price.feesKnown) {
    priceText += listing.fees > 0 ? ` + ${formatCzk(listing.fees)} poplatky` : " vč. poplatků";
  } else {
    priceText += ", poplatky neuvedeny – ověř";
  }
  const parts = [`${listing.disposition}${listing.sizeM2 ? ` (${listing.sizeM2} m²)` : ""}`, where, priceText];
  const furnished = FURNISHED_LABEL[listing.furnished];
  if (furnished) parts.push(furnished);
  const line = `Nový byt: ${parts.join(", ")}`;
  const tags = ["house"];
  if (listing.furnished === "yes" || listing.furnished === "partial") tags.push("couch_and_lamp");
  if (!price.feesKnown) tags.push("warning");
  return {
    title: `Nový byt – ${PORTAL_LABEL[listing.portal] ?? listing.portal}`,
    message: `${line}\n${listing.url}`,
    click: listing.url,
    tags,
    line,
  };
}
