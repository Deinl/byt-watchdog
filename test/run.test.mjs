import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import config from "../config/filters.mjs";
import { runOnce } from "../src/run.mjs";
import { emptyState, loadState, pruneState, saveState } from "../src/state.mjs";

const silent = () => {};

function listing(id, extra = {}) {
  return {
    key: `fake:${id}`,
    portal: "fake",
    id: String(id),
    url: `https://example.test/${id}`,
    disposition: "1+kk",
    rent: 14000,
    fees: 2000,
    furnished: null,
    areaName: "Praha 4",
    quarter: "Krč",
    sizeM2: 20 + Number(id),
    needsDetail: false,
    ...extra,
  };
}

function fakePortal(getListings, enrich) {
  return { name: "fake", search: async () => getListings().map((l) => ({ ...l })), enrich };
}

function collector() {
  const sent = [];
  return { sent, deliver: async (alert, _l, { seeded }) => sent.push({ line: alert.line, seeded }) };
}

test("dedupe: second run with same listings sends nothing", async () => {
  const state = emptyState();
  const items = [listing(1), listing(2, { rent: 16000, fees: 2000 })]; // #2 is over budget
  const c1 = collector();
  const s1 = await runOnce({ config, portals: [fakePortal(() => items)], state, seed: false, deliver: c1.deliver, log: silent });
  assert.equal(c1.sent.length, 1);
  assert.equal(s1.matched, 1);
  const c2 = collector();
  await runOnce({ config, portals: [fakePortal(() => items)], state, seed: false, deliver: c2.deliver, log: silent });
  assert.equal(c2.sent.length, 0);
  assert.ok(state.listings["fake:1"].alertedAt);
  assert.equal(state.listings["fake:2"].matched, false);
});

test("seed run records matches without real alerts", async () => {
  const state = emptyState();
  const c = collector();
  await runOnce({ config, portals: [fakePortal(() => [listing(1)])], state, seed: true, deliver: c.deliver, log: silent });
  assert.deepEqual(c.sent.map((x) => x.seeded), [true]);
  assert.equal(state.listings["fake:1"].alertedAt, "seeded");
});

test("detail cap defers enrichment, except on a seed run", async () => {
  const cfg = { ...config, portals: { ...config.portals, fake: { maxDetailsPerRun: 1 } } };
  const enrich = async (l) => {
    l.fees = 1000;
    l.needsDetail = false;
  };
  const items = () => [1, 2, 3].map((i) => listing(i, { fees: undefined, needsDetail: true }));
  const s1 = await runOnce({ config: cfg, portals: [fakePortal(items, enrich)], state: emptyState(), seed: false, deliver: async () => {}, log: silent });
  assert.equal(s1.deferred, 2);
  const s2 = await runOnce({ config: cfg, portals: [fakePortal(items, enrich)], state: emptyState(), seed: true, deliver: async () => {}, log: silent });
  assert.equal(s2.deferred, 0);
  assert.equal(s2.matched, 3);
});

test("price drop makes a non-matching listing alert once; later change does not re-alert", async () => {
  const state = emptyState();
  let items = [listing(1, { rent: 16000 })];
  const portals = [fakePortal(() => items)];
  const c = collector();
  await runOnce({ config, portals, state, seed: false, deliver: c.deliver, log: silent });
  assert.equal(c.sent.length, 0);
  items = [listing(1, { rent: 14000 })];
  await runOnce({ config, portals, state, seed: false, deliver: c.deliver, log: silent });
  assert.equal(c.sent.length, 1);
  items = [listing(1, { rent: 13500 })];
  await runOnce({ config, portals, state, seed: false, deliver: c.deliver, log: silent });
  assert.equal(c.sent.length, 1);
});

test("failed detail fetch is not recorded and is retried next run", async () => {
  const state = emptyState();
  let fail = true;
  const enrich = async (l) => {
    if (fail) throw new Error("boom");
    l.fees = 1000;
    l.needsDetail = false;
  };
  const portals = [fakePortal(() => [listing(1, { fees: undefined, needsDetail: true })], enrich)];
  const c = collector();
  const s1 = await runOnce({ config, portals, state, seed: false, deliver: c.deliver, log: silent });
  assert.equal(s1.errors.length, 1);
  assert.equal(state.listings["fake:1"], undefined);
  fail = false;
  await runOnce({ config, portals, state, seed: false, deliver: c.deliver, log: silent });
  assert.equal(c.sent.length, 1);
});

test("failed notification leaves listing un-alerted for retry", async () => {
  const state = emptyState();
  const portals = [fakePortal(() => [listing(1)])];
  const s = await runOnce({
    config,
    portals,
    state,
    seed: false,
    deliver: async () => {
      throw new Error("ntfy down");
    },
    log: silent,
  });
  assert.equal(s.errors.length, 1);
  assert.equal(state.listings["fake:1"].alertedAt, null);
  const c = collector();
  await runOnce({ config, portals, state, seed: false, deliver: c.deliver, log: silent });
  assert.equal(c.sent.length, 1);
});

test("portal failure is isolated", async () => {
  const state = emptyState();
  const broken = { name: "broken", search: async () => { throw new Error("HTTP 500"); } };
  const c = collector();
  const s = await runOnce({ config, portals: [broken, fakePortal(() => [listing(1)])], state, seed: false, deliver: c.deliver, log: silent });
  assert.equal(s.portals.broken.ok, false);
  assert.equal(c.sent.length, 1);
});

test("maxAlertsPerRun caps sends and defers the rest", async () => {
  const state = emptyState();
  const items = Array.from({ length: config.maxAlertsPerRun + 3 }, (_, i) => listing(i));
  const c = collector();
  const s = await runOnce({ config, portals: [fakePortal(() => items)], state, seed: false, deliver: c.deliver, log: silent });
  assert.equal(c.sent.length, config.maxAlertsPerRun);
  assert.equal(s.deferred, 3);
});

test("furnished listings are delivered first", async () => {
  const state = emptyState();
  const items = [listing(1, { furnished: "no" }), listing(2), listing(3, { furnished: "yes" })];
  const c = collector();
  await runOnce({ config, portals: [fakePortal(() => items)], state, seed: false, deliver: c.deliver, log: silent });
  assert.match(c.sent[0].line, /zařízený$/);
  assert.match(c.sent[2].line, /nezařízený$/);
});

test("cross-portal duplicate (same disposition/rent/m²/quarter) alerts once", async () => {
  const state = emptyState();
  const a = { ...fakePortal(() => [listing(1)]), name: "a" };
  const b = { ...fakePortal(() => [listing(1, { key: "other:1", fees: null })]), name: "b" };
  const c = collector();
  const s = await runOnce({ config, portals: [a, b], state, seed: false, deliver: c.deliver, log: silent });
  assert.equal(c.sent.length, 1);
  assert.equal(s.duplicates, 1);
  assert.equal(state.listings["other:1"].alertedAt, "duplicate:fake:1");
  // no m² -> no fingerprint -> not merged
  const state2 = emptyState();
  const c2 = collector();
  const a2 = { ...fakePortal(() => [listing(1, { sizeM2: null })]), name: "a" };
  const b2 = { ...fakePortal(() => [listing(1, { key: "other:1", sizeM2: null })]), name: "b" };
  await runOnce({ config, portals: [a2, b2], state: state2, seed: false, deliver: c2.deliver, log: silent });
  assert.equal(c2.sent.length, 2);
});

test("state save/load roundtrip and prune", async () => {
  const dir = await mkdtemp(join(tmpdir(), "byt-watchdog-"));
  try {
    const path = join(dir, "state", "seen.json");
    const missing = await loadState(path);
    assert.equal(missing.existed, false);
    const st = emptyState();
    st.listings["a:1"] = { firstSeen: "2026-01-01T00:00:00Z", lastSeen: "2026-01-01T00:00:00Z", rent: 1, fees: null, matched: true, alertedAt: null };
    st.listings["a:2"] = { firstSeen: "2026-11-01T00:00:00Z", lastSeen: "2026-11-01T00:00:00Z", rent: 1, fees: null, matched: true, alertedAt: null };
    assert.equal(pruneState(st, 30, new Date("2026-11-02T00:00:00Z")), 1);
    await saveState(path, st);
    const back = await loadState(path);
    assert.equal(back.existed, true);
    assert.deepEqual(Object.keys(back.state.listings), ["a:2"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
