// Walks every slot's break plan on every channel and checks what the half-hour
// grid promises: programmes start on :00/:30, a slot is tiled exactly by its
// programme and its breaks, the programme airs whole and in order, breaks are
// spread through it rather than stacked at the end, and no spot repeats inside
// one slot.
//
//   node tools/check-breaks.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
global.window = {};
for (const f of ["data/catalog.js", "data/commercials.js", "data/cuts.js", "channels.js", "scheduler.js"]) {
  const file = path.join(root, f);
  if (fs.existsSync(file)) (0, eval)(fs.readFileSync(file, "utf8"));
}
const W = global.window;
const { locate, planFor, billSec, slotFor, playableSec, buildPool, adSpots } = W.SCHEDULER_INTERNAL;
const catalog = W.CATALOG;
const channels = (W.CHANNELS || []).filter((c) => c.kind === "genre" || c.kind === "curated");
const EPS = 1e-6;

assert.strictEqual(W.SLOT_SEC, 1800, "the grid is half an hour");
assert.ok(adSpots().length > 0, "commercials are loaded");

// -- every bill of every show, planned for its own slot ----------------------
const allIds = Object.keys(catalog.shows).sort();
const { pool, cumulative, totalSec } = buildPool(allIds, catalog, "check", { ordered: true });
const episodeCount = allIds.reduce((n, id) => n + catalog.shows[id].episodes.length, 0);
assert.strictEqual(pool.reduce((n, b) => n + b.eps.length, 0), episodeCount, "every episode is on exactly one bill");
assert.ok(cumulative.every((c) => c % 1800 === 0) && totalSec % 1800 === 0, "every slot starts on a half-hour mark");

const stats = { slots: 0, shared: 0, breaks: 0, inside: 0, snapped: 0, adSec: 0, slotSec: 0, standbySec: 0,
                endOnly: 0, heavy: 0 };
let longestStandby = 0;
for (const bill of pool) {
  const total = billSec(bill);
  const slotSec = slotFor(total);
  const plan = planFor(bill, slotSec);
  const name = `${bill.showId} ${bill.eps[0].key}`;
  stats.slots++;
  stats.slotSec += slotSec;
  if (bill.eps.length > 1) stats.shared++;

  // tiles the slot exactly
  assert.ok(plan.length > 0 && plan[0].start === 0, `${name}: plan starts at 0`);
  for (let i = 1; i < plan.length; i++) {
    assert.ok(Math.abs(plan[i].start - plan[i - 1].end) < EPS, `${name}: gap/overlap at segment ${i}`);
  }
  assert.ok(Math.abs(plan[plan.length - 1].end - slotSec) < EPS, `${name}: plan ends on the slot`);
  assert.ok(plan.every((s) => s.end > s.start), `${name}: empty segment`);

  // the programme airs whole and in order; a return from a break may overlap
  // what aired before it by a few seconds but never skips ahead
  const reached = bill.eps.map(() => 0);
  let lastEp = 0;
  for (const s of plan) {
    if (s.kind !== "show") continue;
    assert.ok(s.ep >= lastEp, `${name}: episodes out of order`);
    lastEp = s.ep;
    assert.ok(s.from <= reached[s.ep] + EPS, `${name}: skipped content in episode ${s.ep}`);
    assert.ok(reached[s.ep] - s.from <= 3 + EPS, `${name}: rewound more than the resume overlap`);
    reached[s.ep] = s.from + (s.end - s.start);
  }
  bill.eps.forEach((ep, i) =>
    assert.ok(Math.abs(reached[i] - playableSec(ep)) < EPS, `${name}: episode ${i} did not air to its end`));

  // breaks: spots fit, never repeat within the slot, and the last one is final
  const breaks = plan.filter((s) => s.kind === "break");
  const seen = new Set();
  for (const b of breaks) {
    let at = 0;
    for (const sp of b.spots) {
      assert.ok(Math.abs(sp.at - at) < EPS, `${name}: spots not back to back`);
      at += sp.spot.durationSec;
      assert.ok(!seen.has(sp.spot.key), `${name}: ${sp.spot.key} airs twice in one slot`);
      seen.add(sp.spot.key);
    }
    const len = b.end - b.start;
    assert.ok(at <= len + EPS, `${name}: spots overrun their break`);
    if (!b.final) {
      assert.ok(Math.abs(at - len) < EPS, `${name}: an inside break has dead air`);
      assert.ok(b.spots.every((sp) => sp.spot.durationSec <= 125), `${name}: long spot mid-programme`);
    }
    stats.adSec += at;
    stats.standbySec += len - at;
    longestStandby = Math.max(longestStandby, len - at);
  }
  stats.breaks += breaks.length;
  stats.inside += breaks.filter((b) => !b.final).length;
  if (total < slotSec) {
    assert.ok(breaks.length && breaks[breaks.length - 1].final && plan[plan.length - 1].kind === "break",
      `${name}: slot does not end on its final break`);
  }
  const pad = slotSec - total;
  const blockTape = bill.show.genre === "Broadcast Blocks";
  if (pad >= 120 && total >= 600 && !blockTape) {
    assert.ok(breaks.length >= 2, `${name}: ${Math.round(pad)}s of ads all at the end`);
  }
  if (breaks.length === 1 && pad >= 120) stats.endOnly++;
  if (pad / slotSec > 0.4) stats.heavy++;
  if (W.CUTS && bill.eps.length === 1 && W.CUTS[bill.eps[0].key]) {
    const quiet = new Set(W.CUTS[bill.eps[0].key].map((t) => t - (bill.eps[0].introSkipSec || 0)));
    stats.snapped += breaks.filter((b) => !b.final && quiet.has(b.from)).length;
  }
}

// -- every channel: boundaries on the clock, positions agree with the plan ---
const t0 = W.EPOCH_MS + Math.floor((Date.now() - W.EPOCH_MS) / 1800000) * 1800000;
let sampled = 0;
for (const c of channels) {
  for (let m = 0; m < 24 * 60; m += 7) {
    const at = t0 + m * 60000 + 1234;
    const pos = W.getPositionAt(c, catalog, at);
    if (!pos) continue;
    sampled++;
    const boundary = new Date(Math.round(at + pos.slotEndsInSec * 1000));
    assert.ok(boundary.getMinutes() % 30 === 0 && boundary.getSeconds() === 0,
      `ch${c.number}: slot ends at ${boundary.toTimeString().slice(0, 8)}`);
    assert.ok(pos.segmentEndsInSec > 0 && pos.segmentEndsInSec <= pos.slotEndsInSec + EPS, `ch${c.number}: segment end`);
    if (pos.padding) {
      assert.ok(pos.break && pos.break.endsInSec > 0, `ch${c.number}: break without an end`);
      assert.ok(pos.break.final ? !pos.break.returning : pos.break.returning.episode, `ch${c.number}: what comes back`);
      if (pos.break.spot) assert.ok(pos.break.spotOffsetSec < pos.break.spot.durationSec, `ch${c.number}: spot offset`);
    } else {
      assert.ok(pos.offsetSec >= 0 && pos.offsetSec < playableSec(pos.episode), `ch${c.number}: offset in episode`);
    }
    // one second after a segment ends, the picture really has moved on
    const after = W.getPositionAt(c, catalog, at + (pos.segmentEndsInSec + 1) * 1000);
    assert.ok(after, `ch${c.number}: no position after a segment`);
  }
}

const pct = (a, b) => `${((a / b) * 100).toFixed(1)}%`;
console.log(`ok — ${stats.slots} slots (${stats.shared} shared by several shorts), ${sampled} channel positions`);
console.log(`     ${stats.breaks} breaks, ${stats.inside} of them inside a programme` +
            (W.CUTS ? `, ${stats.snapped} snapped to a quiet moment` : ""));
console.log(`     ads ${pct(stats.adSec, stats.slotSec)} of airtime, countdown card ${pct(stats.standbySec, stats.slotSec)}` +
            ` (longest ${Math.round(longestStandby)}s)`);
console.log(`     ${stats.endOnly} slots with 2+ minutes of ads and only an end break; ${stats.heavy} slots over 40% ads`);
