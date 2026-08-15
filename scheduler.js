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

// Every episode occupies a whole number of SLOT_SEC-sized slots rather than
// just its own runtime, so program starts always land on a clean grid mark —
// the epoch is local midnight and every slot is a multiple of SLOT_SEC, so
// the grid stays on the clock forever. The leftover tail of a slot (a
// 22-minute episode in a 25-minute slot) is dead air the player fills with
// commercials, or a countdown card once nothing fits what's left.
//
// A fine 5-minute grid rather than a flat 30 minutes specifically to cut
// that leftover tail down: at 30 minutes, a typical ~22-minute sitcom or
// cartoon always rounds up to the *next* half-hour mark, leaving a fixed
// 8-minute commercial tail on every single airing, every channel, no
// exceptions. At 5 minutes, that same episode only rounds up to 25 minutes —
// a 3-minute tail instead. Programs still start on a clean, deterministic
// grid mark; it's just a finer one. guide.js's own column headers ("NOW",
// "+30", "+60") are intentionally *not* derived from this constant — see
// GUIDE_COLUMN_SEC there — a real TV Guide's columns mean literal 30/60-
// minute lookaheads regardless of how finely a station grids its own
// programming underneath.
const SLOT_SEC = 5 * 60;
const slotFor = (durationSec) => Math.ceil(durationSec / SLOT_SEC) * SLOT_SEC;

// How much of a file actually airs. Some rips open on footage that isn't the
// show — a station bumper, an uploader's colorization credit — and
// episode.introSkipSec (from VaultVision's introSkipSeconds/introSkipBySeason)
// is how far in the real content starts. That intro is not part of the
// broadcast at all, so it comes off the length the schedule reasons about:
// slot start maps to content start, and the slot ends when the content does.
//
// Everything downstream must agree on this — if the grid sized slots by the
// full file while the player seeked past the intro, the picture would run
// `introSkipSec` past the end of the file at the tail of every airing.
// ponytail: clamped to 1s rather than validated at build time — a skip longer
// than the file is bad data, and a 1-second slot is a visible symptom rather
// than a division by zero.
const playableSec = (ep) => Math.max(1, ep.durationSec - (ep.introSkipSec || 0));

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
// `slotted`: programs occupy whole half-hour slots (the broadcast grid);
// commercials pack back-to-back with no padding of their own.
// `ordered`: skip the shuffle and keep catalog order, for serials that only
// make sense front-to-back (Dark Shadows is 1,239 continuous chapters).
// windowElapsedSec already carries a daypart across nights and locate() wraps
// at the end of the pool, so "ordered" gets episode 1 -> last -> episode 1
// for free.
function buildPool(showIds, catalog, seedStr, { slotted = true, ordered = false } = {}) {
  const flat = [];
  for (const id of showIds) {
    const show = catalog.shows[id];
    if (!show) {
      console.warn(`scheduler: channel references unknown show "${id}" — skipping`);
      continue;
    }
    for (const episode of show.episodes) flat.push({ showId: id, show, episode });
  }
  const sequence = ordered ? flat : shuffled(flat, seedStr);
  const cumulative = new Array(sequence.length);
  let acc = 0;
  for (let i = 0; i < sequence.length; i++) {
    cumulative[i] = acc;
    // Commercials pack by their true length; programmes by the slot their
    // airable content rounds up to.
    acc += slotted ? slotFor(playableSec(sequence[i].episode)) : sequence[i].episode.durationSec;
  }
  return { pool: sequence, cumulative, totalSec: acc, slotted };
}

// -- broken files -------------------------------------------------------------
// archive.org items rot: a file listed in an item's metadata can still 404 or
// refuse to decode. The player reports those here the moment the <video>
// element gives up, and every lookup from then on substitutes past them for
// the rest of the session — so the guide never advertises a programme the
// player already knows it can't show. Session-only on purpose: it's a
// runtime observation, not a fact about the catalog.
const brokenKeys = new Set();

// The next entry at or after `idx` that isn't known-broken. Falls back to the
// original once it's been all the way round — if every file in a pool is
// dead there's nothing to substitute, and the player shows NO SIGNAL.
function usableFrom(pool, idx) {
  if (brokenKeys.size === 0) return pool[idx];
  let i = idx;
  for (let hops = 0; hops < pool.length; hops++) {
    if (!brokenKeys.has(pool[i].episode.key)) return pool[i];
    i = (i + 1) % pool.length;
  }
  return pool[idx];
}

function locate(poolInfo, elapsedSec) {
  const { pool, cumulative, totalSec, slotted } = poolInfo;
  if (pool.length === 0 || totalSec <= 0) return null;
  // Safe mod for any sign — but the negative branch's round-trip through
  // `+ totalSec` costs an ULP, which can drop a value that sits exactly on a
  // cumulative boundary just below it, landing the search on the *previous*
  // entry at ~100% of its duration. getAdAt anchors breaks exactly on
  // boundaries, so take the exact path whenever elapsed is already positive.
  const t = elapsedSec >= 0 ? elapsedSec % totalSec : ((elapsedSec % totalSec) + totalSec) % totalSec;
  let lo = 0, hi = pool.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumulative[mid] <= t) lo = mid; else hi = mid - 1;
  }
  const offsetSec = t - cumulative[lo];
  const scheduled = pool[lo]; // what the grid says; may be unplayable
  const entry = usableFrom(pool, lo);
  if (!slotted) {
    // Commercial pool: no slot grid, so none of the padding fields apply.
    return { showId: entry.showId, show: entry.show, episode: entry.episode, offsetSec };
  }
  const next = usableFrom(pool, (lo + 1) % pool.length);
  return {
    showId: entry.showId,
    show: entry.show,
    episode: entry.episode,
    offsetSec,
    // Past the episode's airable runtime but still inside its slot: dead air
    // until the clock reaches the next grid mark. Callers must check this
    // before treating offsetSec as a seek position. A substitute shorter than
    // the programme it replaced simply goes to break early.
    padding: offsetSec >= playableSec(entry.episode),
    // Measured from the *scheduled* entry, never the substitute — a dead file
    // must not shift the grid, or channels and the guide would disagree about
    // when the next programme starts.
    slotEndsInSec: slotFor(playableSec(scheduled.episode)) - offsetSec,
    next: { showId: next.showId, show: next.show, episode: next.episode },
  };
}

const poolCache = new Map(); // cacheKey -> poolInfo, memoized across calls
function cachedPool(cacheKey, showIds, catalog, seedStr, opts) {
  let info = poolCache.get(cacheKey);
  if (!info) {
    info = buildPool(showIds, catalog, seedStr, opts);
    poolCache.set(cacheKey, info);
  }
  return info;
}

// -- commercials --------------------------------------------------------------
// Ads only ever run in the dead tail of a slot, after an episode has ended —
// never inside one. The spots come from data/commercials.js
// (tools/build-commercials.py); wrapping them in a one-show pseudo-catalog
// lets the same shuffle + prefix-sum machinery index them.
function adPool() {
  const spots = (window.COMMERCIALS && window.COMMERCIALS.spots) || [];
  const wrapped = { shows: { ads: { id: "ads", title: "Commercial", episodes: spots } } };
  return cachedPool("ads", ["ads"], wrapped, "ads:v1", { slotted: false });
}

// What's airing `padElapsedSec` into a slot's dead tail, given `padLeftSec`
// still to fill. Each break starts at the top of a spot — anchored at a
// per-episode index in the shuffled pool, so it's deterministic like
// everything else, but a different break every time rather than the same ads
// in the same order. Returns null when there are no spots, or when the next
// one wouldn't finish before the slot rolls over: the player shows the
// countdown card for that leftover sliver rather than cutting an ad off.
function getAdAt(episodeKey, padElapsedSec, padLeftSec) {
  const info = adPool();
  if (!info || info.pool.length === 0) return null;
  const startIdx = hashSeed(`ad:${episodeKey}`) % info.pool.length;
  const found = locate(info, info.cumulative[startIdx] + padElapsedSec);
  if (!found) return null;
  // A substituted spot can be shorter than the one it replaced, putting the
  // offset past its end — skip to the STAND BY card rather than seeking off
  // the end of it.
  if (found.offsetSec >= found.episode.durationSec) return null;
  if (found.episode.durationSec - found.offsetSec > padLeftSec) return null;
  return { spot: found.episode, offsetSec: found.offsetSec };
}

function genrePool(channel, catalog) {
  const cacheKey = `genre:${channel.number}`;
  let ids = poolCache.get(cacheKey + ":ids");
  if (!ids) {
    // `excludeShowIds` is optional — lets a genre channel opt a specific show
    // out of its otherwise-automatic, zero-curation pool. Currently unused:
    // its only user was REALITY CHECK hiding LivePDSeriesNotDoneYet (every
    // file needs an archive.org login, so it could never play), and that turned
    // out to be the wrong layer — it hid the show from one channel while VOD,
    // which reads the catalog directly, still offered it. Genuinely unplayable
    // shows belong in build-catalog.py's EXCLUDED_SHOWS so they leave the
    // catalog altogether. Kept for the case this was meant for: a show that
    // plays fine but doesn't belong on one particular channel.
    const excluded = new Set(channel.excludeShowIds || []);
    // `genre` is one tag or a list of them — the movie channels sweep several
    // (VBO ACTION is "Action & Adventure" + "Sci-Fi & Fantasy").
    const wanted = new Set([].concat(channel.genre));
    ids = Object.values(catalog.shows)
      .filter((s) => wanted.has(s.genre) && !excluded.has(s.id))
      .map((s) => s.id)
      .sort();
    poolCache.set(cacheKey + ":ids", ids);
  }
  // `seed` overrides the shuffle key so two channels can carry the same pool
  // and still never be showing the same thing (VBO / VBO 2).
  return cachedPool(cacheKey, ids, catalog,
                    channel.seed || `genre:${[].concat(channel.genre).join("+")}`);
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
      const info = cachedPool(cacheKey, match.win.pool, catalog, cacheKey,
                              { ordered: !!match.win.ordered });
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
const _internal = { hashSeed, mulberry32, shuffled, buildPool, locate, windowElapsedSec, slotFor,
                    playableSec, adPool, brokenKeys };

window.getPositionAt = getPositionAt;
window.getAdAt = getAdAt;
window.markBroken = (key) => brokenKeys.add(key);
window.isBroken = (key) => brokenKeys.has(key);
window.EPOCH_MS = EPOCH_MS;
window.SLOT_SEC = SLOT_SEC;
window.playableSec = playableSec;
window.SCHEDULER_INTERNAL = _internal;
