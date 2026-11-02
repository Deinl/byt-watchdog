import assert from "node:assert/strict";
import { test } from "node:test";
import config from "../config/filters.mjs";
import { formatAlert, formatCzk } from "../src/alert.mjs";
import { parseFees } from "../src/fees.mjs";
import { normalizeMc, prefilter, priceRule, resolveArea } from "../src/match.mjs";
import { resolveServer, validateTopic } from "../src/notify.mjs";
import * as bezrealitky from "../src/portals/bezrealitky.mjs";
import * as idnes from "../src/portals/idnes.mjs";
import * as sreality from "../src/portals/sreality.mjs";

test("parseFees: real Sreality price_note sums fee parts", () => {
  assert.equal(parseFees("+ 4650 Kč poplatky + převod elektřiny na nájemce (500 Kč)", 14000), 5150);
});

test("parseFees: ignores the rent amount and deposits", () => {
  const t = "Celková cena: 14 000 Kč / měsíc + 2 500 Kč poplatky. Vratná kauce 28 000 Kč.";
  assert.equal(parseFees(t, 14000), 2500);
});

test("parseFees: fee keyword before amount, various separators", () => {
  assert.equal(parseFees("Zálohy na služby: 3.200,- Kč měsíčně", 15000), 3200);
  assert.equal(parseFees("poplatky 1 800 Kč", 15000), 1800);
});

test("parseFees: included -> 0, nothing -> null", () => {
  assert.equal(parseFees("Cena je včetně poplatků.", 16000), 0);
  assert.equal(parseFees("Krásný byt v centru, volný ihned.", 16000), null);
  assert.equal(parseFees("", 16000), null);
  assert.equal(parseFees(null, 16000), null);
});

test("parseFees: commission is not a fee", () => {
  assert.equal(parseFees("Provize RK 15 000 Kč.", 15000), null);
});

test("normalizeMc", () => {
  assert.equal(normalizeMc("Praha 4"), "Praha 4");
  assert.equal(normalizeMc("praha-12"), "Praha 12");
  assert.equal(normalizeMc("Praha-Kunratice"), null);
});

test("resolveArea: MČ given directly", () => {
  assert.equal(resolveArea({ mc: "Praha 12" }, config), "Praha 12");
  assert.equal(resolveArea({ mc: "Praha 15" }, config), null);
  assert.equal(resolveArea({ mc: null, quarter: "Praha 11" }, config), "Praha 11");
});

test("resolveArea: quarter + zip", () => {
  assert.equal(resolveArea({ quarter: "Krč", zip: "142 00" }, config), "Praha 4");
  assert.equal(resolveArea({ quarter: "Háje", zip: null }, config), "Praha 11");
  assert.equal(resolveArea({ quarter: "Vinohrady", zip: "120 00" }, config), "Praha 2");
  assert.equal(resolveArea({ quarter: "Vinohrady", zip: "10100" }, config), "Praha 10");
  assert.equal(resolveArea({ quarter: "Vinohrady", zip: "13000" }, config), null); // Praha 3
  assert.equal(resolveArea({ quarter: "Vinohrady" }, config), null); // ambiguous without zip
  assert.equal(resolveArea({ quarter: "Žižkov", zip: "130 00" }, config), null);
  assert.equal(resolveArea({ quarter: "Písnice", zip: "142 00" }, config), null); // Praha-Libuš
  assert.equal(resolveArea({ quarter: "Strašnice", zip: "999 99" }, config), "Praha 10"); // bad zip, unambiguous quarter
});

test("resolveArea: excluded small MČ wins over a lumped district", () => {
  assert.equal(resolveArea({ mc: "Praha 11", quarter: "Šeberov" }, config), null);
  assert.equal(resolveArea({ mc: "Praha 4", quarter: "Kunratice" }, config), null);
  assert.equal(resolveArea({ mc: "Praha 4", quarter: "Praha-Kunratice" }, config), null);
  assert.equal(resolveArea({ mc: "Praha 11", quarter: "Chodov" }, config), "Praha 11");
});

test("priceRule: fees known vs unknown", () => {
  assert.deepEqual(priceRule({ rent: 14500, fees: 2500 }, config), { ok: true, feesKnown: true, total: 17000 });
  assert.equal(priceRule({ rent: 14500, fees: 2501 }, config).ok, false);
  assert.deepEqual(priceRule({ rent: 15000, fees: null }, config), { ok: true, feesKnown: false, total: null });
  assert.equal(priceRule({ rent: 15001, fees: null }, config).ok, false);
  assert.equal(priceRule({ rent: 16000, fees: 0 }, config).ok, true);
});

test("prefilter rejects other dispositions / areas / expensive", () => {
  const base = { disposition: "1+kk", rent: 14000, areaName: "Praha 4" };
  assert.equal(prefilter(base, config).ok, true);
  assert.equal(prefilter({ ...base, disposition: "2+kk" }, config).ok, false);
  assert.equal(prefilter({ ...base, areaName: null }, config).ok, false);
  assert.equal(prefilter({ ...base, rent: 17001 }, config).ok, false);
});

test("formatAlert: Czech text with fees and furnishing", () => {
  const listing = {
    portal: "sreality",
    disposition: "1+kk",
    sizeM2: null,
    areaName: "Praha 4",
    quarter: "Nusle",
    rent: 14500,
    fees: 2500,
    furnished: "yes",
    url: "https://www.sreality.cz/detail/x/1",
  };
  const a = formatAlert(listing, { feesKnown: true });
  assert.equal(a.line, "Nový byt: 1+kk, Praha 4 – Nusle, 14 500 Kč + 2 500 Kč poplatky, zařízený");
  assert.equal(a.message, `${a.line}\nhttps://www.sreality.cz/detail/x/1`);
  const b = formatAlert({ ...listing, fees: null, furnished: null }, { feesKnown: false });
  assert.equal(b.line, "Nový byt: 1+kk, Praha 4 – Nusle, 14 500 Kč, poplatky neuvedeny – ověř");
  assert.ok(b.tags.includes("warning"));
  assert.equal(formatCzk(1234567), "1 234 567 Kč");
});

test("sreality normalize + applyDetail", () => {
  const r = {
    hash_id: 3416395852,
    advert_name: "Pronájem bytu 1+kk 32 m²",
    category_sub_cb: { value: 2 },
    price_czk: 14000,
    price_unit_cb: { value: 2 },
    locality: {
      city_seo_name: "praha",
      citypart: "Krč",
      citypart_seo_name: "krc",
      street_seo_name: "sladkovicova",
      quarter: "Praha 4",
    },
  };
  const l = sreality.normalize(r, config);
  assert.equal(l.key, "sreality:3416395852");
  assert.equal(l.url, "https://www.sreality.cz/detail/pronajem/byt/1+kk/praha-krc-sladkovicova/3416395852");
  assert.equal(l.areaName, "Praha 4");
  assert.equal(l.sizeM2, 32);
  sreality.applyDetail(l, {
    result: {
      price_czk: 14000,
      price_note: "+ 4650 Kč poplatky + převod elektřiny na nájemce (500 Kč)",
      furnished: { value: 3 },
      usable_area: 32,
    },
  });
  assert.equal(l.fees, 5150);
  assert.equal(l.furnished, "partial");
  assert.equal(sreality.normalize({ ...r, locality: { ...r.locality, quarter: "Praha 15", citypart: "Hostivař" } }, config).areaName, null);
  assert.equal(sreality.normalize({ ...r, category_sub_cb: { value: 4 } }, config), null);
});

test("bezrealitky normalize", () => {
  const a = {
    id: "1059487",
    uri: "1059487-nabidka-pronajem-bytu-hekrova-praha",
    disposition: "DISP_1_1",
    price: 15000,
    charges: 3540,
    currency: "CZK",
    equipped: "CASTECNE",
    surface: 29,
    cityDistrict: "Praha - Háje",
    zip: "149 00",
  };
  const l = bezrealitky.normalize(a, config);
  assert.equal(l.areaName, "Praha 11");
  assert.equal(l.quarter, "Háje");
  assert.equal(l.fees, 3540);
  assert.equal(l.furnished, "partial");
  assert.equal(l.url, "https://www.bezrealitky.cz/nemovitosti-byty-domy/1059487-nabidka-pronajem-bytu-hekrova-praha");
  assert.equal(bezrealitky.normalize({ ...a, charges: 0 }, config).fees, null);
  assert.equal(bezrealitky.normalize({ ...a, disposition: "GARSONIERA" }, config).disposition, "garsonka");
  assert.equal(bezrealitky.quarterFromCityDistrict("Praha - Žižkov"), "Žižkov");
});

const IDNES_CARD = (slug, id, title, info, price) => `
<div class="c-products__item"><article><a onclick="x" href="https://reality.idnes.cz/detail/pronajem/byt/${slug}/${id}/" class="c-products__link">
<div class="c-products__content"><h2 class="c-products__title"> <span class="text-capitalize">pronájem</span> ${title} </h2>
<p class="c-products__info"> ${info} </p><div class="c-products__footer"><p class="c-products__price"> <strong>${price}</strong> </p></div></div></a></article></div>`;

test("idnes parseCards: slug MČ wins over postal locality", () => {
  const html =
    IDNES_CARD("praha-12-ceskoslovenskeho-exilu", "6ac6188ad2bdbbabd105ec57", "bytu 1+kk 37 m²", "Československého exilu, Praha 4 - Modřany", "14 900 Kč/měsíc") +
    IDNES_CARD("praha-15-milanska", "6ab6e249e5c721c0680393bf", "bytu 1+1 20 m²", "Milánská, Praha 10 - Horní Měcholupy", "14 900 Kč/měsíc") +
    IDNES_CARD("praha-4-x", "6ab6e249e5c721c0680393b0", "bytu 1+kk 30 m²", "X, Praha 4 - Krč", "Cena na vyžádání") +
    IDNES_CARD("praha-11-musilova", "6aa1def3f81dfba923099939", "bytu 1+kk 22 m²", "Musilova, Praha 11 - Šeberov", "14 000 Kč/měsíc");
  const cards = idnes.parseCards(html, config);
  assert.equal(cards.length, 3);
  assert.equal(cards[2].areaName, null); // Šeberov is its own MČ despite the praha-11 slug
  assert.equal(cards[0].areaName, "Praha 12");
  assert.equal(cards[0].quarter, "Modřany");
  assert.equal(cards[0].rent, 14900);
  assert.equal(cards[0].sizeM2, 37);
  assert.equal(cards[0].fees, null);
  assert.equal(cards[1].areaName, null);
  assert.equal(idnes.buildSearchUrl(1, config), "https://reality.idnes.cz/s/pronajem/byty/do-17000-za-mesic/praha/?page=1&dispozice=1-kk%7C1-1");
});

test("ntfy topic + server validation", () => {
  assert.equal(validateTopic("byt_alerts-123"), "byt_alerts-123");
  assert.throws(() => validateTopic("bad/topic"));
  assert.throws(() => validateTopic(""));
  assert.equal(resolveServer(undefined), "https://ntfy.sh");
  assert.throws(() => resolveServer("http://ntfy.example"));
});
