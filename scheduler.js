// Pure scheduling math — no DOM, no fetch. Given a channel (from channels.js)
// and the catalog (from data/catalog.js), answers "what's airing at time T
// and how far into it are we", deterministically from wall-clock time alone.
// That's what makes flipping to a channel join a show already in progress,
// and what lets the Guide look ahead to future slots with the same function.
//
// Plain script, not a module — file:// pages can't load ES modules at all
// (Chrome refuses cross-origin module fetches outright, no CORS header can
// fix it), so this and every other file here follow VaultVision's own
// approach: plain `<script src>` tags in dependency order, sharing one
// top-level scope, with the few things other files need exposed explicitly
// on `window` at the bottom.

// Arbitrary fixed reference point every channel's timeline is measured from.
// Any fixed instant works — it only has to never change once shipped, or
// every channel's position would jump on the next load. Picked a Monday for
// tidy week alignment with the dayparting math below.
const EPOCH_MS = new Date("2020-01-06T00:00:00").getTime();
const WEEK_MS = 7 * 24 * 3600 * 1000;

// -- deterministic shuffle ---------------------------------------------------
// Same seed -> same order, every reload, every machine. That's what makes a
// channel's schedule reproducible without storing anything.
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, seedStr) {
  const rand = mulberry32(hashSeed(seedStr));
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// -- pool building ------------------------------------------------------------
// A "pool" is a flat, deterministically-ordered list of every episode of
// every show in a set of showIds, plus a prefix-sum duration index so a
// timestamp can be located in it with a binary search.
function buildPool(showIds, catalog, seedStr) {
  const flat = [];
  for (const id of showIds) {
    const show = catalog.shows[id];
    if (!show) {
      console.warn(`scheduler: channel references unknown show "${id}" — skipping`);
      continue;
    }
    for (const episode of show.episodes) flat.push({ showId: id, show, episode });
  }
  const ordered = shuffled(flat, seedStr);
  const cumulative = new Array(ordered.length);
  let acc = 0;
  for (let i = 0; i < ordered.length; i++) {
    cumulative[i] = acc;
    acc += ordered[i].episode.durationSec;
  }
  return { pool: ordered, cumulative, totalSec: acc };
}

function locate(poolInfo, elapsedSec) {
  const { pool, cumulative, totalSec } = poolInfo;
  if (pool.length === 0 || totalSec <= 0) return null;
  const t = ((elapsedSec % totalSec) + totalSec) % totalSec; // safe mod for any sign
  let lo = 0, hi = pool.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumulative[mid] <= t) lo = mid; else hi = mid - 1;
  }
  const entry = pool[lo];
  return {
    showId: entry.showId,
    show: entry.show,
    episode: entry.episode,
    offsetSec: t - cumulative[lo],
  };
}

const poolCache = new Map(); // cacheKey -> poolInfo, memoized across calls
function cachedPool(cacheKey, showIds, catalog, seedStr) {
  let info = poolCache.get(cacheKey);
  if (!info) {
    info = buildPool(showIds, catalog, seedStr);
    poolCache.set(cacheKey, info);
  }
  return info;
}

function genrePool(channel, catalog) {
  const cacheKey = `genre:${channel.number}`;
  let ids = poolCache.get(cacheKey + ":ids");
  if (!ids) {
    ids = Object.values(catalog.shows)
      .filter((s) => s.genre === channel.genre)
      .map((s) => s.id)
      .sort();
    poolCache.set(cacheKey + ":ids", ids);
  }
  return cachedPool(cacheKey, ids, catalog, `genre:${channel.genre}`);
}

// -- dayparting ---------------------------------------------------------------
// Cumulative real airtime a recurring weekly window has had since EPOCH_MS,
// through `nowMs` (a *complete* past occurrence counts in full; the
// in-progress one, if any, counts partially). This is what lets next
// Saturday's cartoon block continue where last Saturday's left off, the same
// way real reruns advance week to week, rather than restarting each time.
//
// The bulk "complete past weeks" term uses plain millisecond division, which
// drifts by up to an hour around DST transitions (twice a year) — immaterial
// for a nostalgia simulator with thousands of episodes per pool. The *current*
// week's occurrences are located with real Date/setDate/setHours arithmetic,
// which is DST-correct, since that's the part visible as "what's on right now".
function windowElapsedSec(win, nowMs) {
  const windowLenMs = (win.endHour - win.startHour) * 3600 * 1000;
  const weeksSince = Math.floor((nowMs - EPOCH_MS) / WEEK_MS);
  let totalMs = weeksSince * win.days.length * windowLenMs;

  const now = new Date(nowMs);
  for (const dow of win.days) {
    const occStart = new Date(now);
    occStart.setDate(now.getDate() + (dow - now.getDay()));
    occStart.setHours(win.startHour, 0, 0, 0);
    const occEnd = new Date(occStart.getTime() + windowLenMs);
    if (nowMs >= occEnd.getTime()) totalMs += windowLenMs;
    else if (nowMs > occStart.getTime()) totalMs += nowMs - occStart.getTime();
    // else: this week's occurrence hasn't started yet — contributes 0
  }
  return totalMs / 1000;
}

function matchingWindow(channel, nowMs) {
  const now = new Date(nowMs);
  for (let wi = 0; wi < channel.daypart.length; wi++) {
    const win = channel.daypart[wi];
    if (!win.days.includes(now.getDay())) continue;
    if (now.getHours() >= win.startHour && now.getHours() < win.endHour) {
      return { win, index: wi };
    }
  }
  return null;
}

// -- public API -----------------------------------------------------------
// getPositionAt(channel, catalog, timestampMs) ->
//   { showId, show, episode, offsetSec } | null (empty pool)
function getPositionAt(channel, catalog, timestampMs) {
  if (channel.kind === "genre") {
    return locate(genrePool(channel, catalog), (timestampMs - EPOCH_MS) / 1000);
  }

  if (channel.kind === "curated") {
    const match = matchingWindow(channel, timestampMs);
    if (match) {
      const cacheKey = `curated:${channel.number}:w${match.index}`;
      const info = cachedPool(cacheKey, match.win.pool, catalog, cacheKey);
      return locate(info, windowElapsedSec(match.win, timestampMs));
    }
    // Outside every window: plain continuous loop, same formula as a genre
    // channel. (Simplification: this does *not* track cumulative
    // fallback-only airtime, so content can jump discontinuously right as a
    // window starts/ends — acceptable for filler between named blocks.)
    const cacheKey = `curated:${channel.number}:fallback`;
    const info = cachedPool(cacheKey, channel.fallbackPool, catalog, cacheKey);
    return locate(info, (timestampMs - EPOCH_MS) / 1000);
  }

  return null; // "guide" has no position of its own
}

// Exposed for the manual test harness and for anything that wants to reason
// about determinism directly.
const _internal = { hashSeed, mulberry32, shuffled, buildPool, locate, windowElapsedSec };

window.getPositionAt = getPositionAt;
window.EPOCH_MS = EPOCH_MS;
window.SCHEDULER_INTERNAL = _internal;
