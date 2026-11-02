// byt-watchdog — the ONE place to edit search filters.
// Plain ESM object so it can carry comments. Czech text uses real UTF-8 diacritics.

export default {
  // Pronájem bytů v Praze.
  city: "Praha",

  // Allowed dispositions (normalized labels used across all portals).
  // Sreality has no "garsonka" category (garsonky are listed as 1+kk);
  // Bezrealitky maps GARSONIERA -> "garsonka".
  dispositions: ["garsonka", "1+kk", "1+1"],

  // Target městské části. A listing matches an area when:
  //  - the portal gives the MČ name directly (Sreality `quarter`, iDNES URL slug), or
  //  - the portal gives a cadastral quarter (Bezrealitky) that is listed in `quarters`;
  //    quarters shared with other MČ (see `quartersNeedingZip`) also need a matching ZIP prefix.
  areas: [
    {
      name: "Praha 2",
      quarters: ["Vyšehrad", "Nové Město", "Vinohrady", "Nusle"],
      zips: ["120", "128"],
    },
    {
      name: "Praha 4",
      quarters: ["Braník", "Hodkovičky", "Krč", "Lhotka", "Podolí", "Michle", "Nusle", "Záběhlice"],
      zips: ["140", "141", "142", "147"],
    },
    {
      name: "Praha 10",
      quarters: ["Strašnice", "Vršovice", "Malešice", "Michle", "Vinohrady", "Záběhlice"],
      zips: ["100", "101", "106", "108"],
    },
    {
      name: "Praha 11",
      quarters: ["Chodov", "Háje"],
      zips: ["148", "149"],
    },
    {
      name: "Praha 12",
      quarters: ["Modřany", "Kamýk", "Komořany", "Cholupice", "Točná"],
      zips: ["143"],
    },
  ],

  // Quarters split between a target MČ and a non-target one (Praha 1 / Praha 3 / …).
  // Without a ZIP these are rejected rather than guessed.
  quartersNeedingZip: ["Nové Město", "Vinohrady", "Nusle", "Michle", "Záběhlice"],

  // Separate small MČ that portals lump under "Praha 4 / 10 / 11" (postal or správní obvod),
  // e.g. iDNES shows Šeberov under praha-11. A listing whose quarter is here is always rejected.
  excludeQuarters: [
    "Kunratice", "Šeberov", "Libuš", "Písnice", "Křeslice", "Újezd", "Hostivař", "Petrovice",
    "Štěrboholy", "Dolní Měcholupy", "Horní Měcholupy", "Dubeč", "Uhříněves", "Benice",
    "Kolovraty", "Lipany", "Královice", "Nedvězí", "Pitkovice", "Hájek",
  ],

  price: {
    // Fees (poplatky / zálohy) known: rent + fees must be <= this.
    maxTotalWithFees: 17000,
    // Fees unknown: rent alone must be <= this; alert is marked "poplatky neuvedeny – ověř".
    maxRentFeesUnknown: 15000,
  },

  // Furnished is preferred, never required. Furnished listings are sent first and tagged.
  preferFurnished: true,

  portals: {
    sreality: {
      enabled: true,
      // Old districts (okres) Praha 2 / 4 / 10 — Praha 11 and 12 are inside okres Praha 4.
      // Exact MČ is then checked client-side via `locality.quarter`.
      districtIds: [5002, 5004, 5010],
      // Sreality category_sub_cb: 2 = 1+kk, 3 = 1+1.
      subCategories: [2, 3],
      pageLimit: 100,
      maxPages: 3,
      // Detail fetches (needed for fees + furnished) per run; the rest wait for the next run.
      maxDetailsPerRun: 60,
      minIntervalMs: 1200,
    },
    bezrealitky: {
      enabled: true,
      // OSM relation id of Praha used by bezrealitky.cz search.
      regionOsmIds: ["R435514"],
      dispositions: ["GARSONIERA", "DISP_1_KK", "DISP_1_1"],
      pageLimit: 100,
      maxPages: 3,
      minIntervalMs: 1500,
    },
    idnes: {
      enabled: true,
      // Listing is sorted newest first; a couple of pages per run is enough with dedupe.
      maxPages: 3,
      minIntervalMs: 2000,
    },
  },

  // Notification safety caps.
  maxAlertsPerRun: 20,
  // Forget listings not seen in any search for this many days.
  pruneAfterDays: 30,
};
