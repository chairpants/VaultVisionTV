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

// Every programme occupies a whole number of half-hour slots rather than just
// its own runtime, so programme starts always land on :00 or :30 — the epoch
// is local midnight and every slot is a multiple of SLOT_SEC, so the grid
// stays on the clock forever. The difference between a programme's runtime
// and its slot (a 22-minute episode in a 30-minute slot) is commercial time,
// and it is spread through the programme as several short breaks rather than
// stacked at the end — see the break plan below.
//
// This was a 5-minute grid while ads could only run in a slot's tail: at 30
// minutes that meant a fixed 8-minute wall of commercials after every sitcom.
// With breaks inside the programme the same 8 minutes is three ~2:40 breaks,
// which is what a half hour of broadcast TV actually looked like.
const SLOT_SEC = 30 * 60;
const slotFor = (durationSec) => Math.max(1, Math.ceil(durationSec / SLOT_SEC)) * SLOT_SEC;

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
// A "pool" is a flat, deterministically-ordered list of *bills* — what airs in
// one slot — plus a prefix-sum duration index so a timestamp can be located
// in it with a binary search.
//
// A bill is usually one episode. Shorts are the exception: an 11-minute
// cartoon alone in a half-hour slot would be 19 minutes of commercials, so
// consecutive episodes of the same show share a slot for as long as they fit
// with room left for ads — two 11-minute segments, or eight 3-minute
// Schoolhouse Rocks, the way they actually aired. Built from each show's own
// catalog order, before the shuffle, so a bill is always neighbouring
// episodes of one show.
//
// `ordered`: skip the shuffle and keep catalog order, for serials that only
// make sense front-to-back (Dark Shadows is 1,239 continuous chapters).
// windowElapsedSec already carries a daypart across nights and locate() wraps
// at the end of the pool, so "ordered" gets episode 1 -> last -> episode 1
// for free.
const BILL_FILL_SEC = 25 * 60; // a bill stops growing here: at least 5 minutes of the half hour stays ads

const billSec = (bill) => bill.eps.reduce((sec, ep) => sec + playableSec(ep), 0);

function billsFor(id, show) {
  const out = [];
  let open = null, openSec = 0;
  show.episodes.forEach((episode, idx) => {
    const sec = playableSec(episode);
    if (open && openSec + sec <= BILL_FILL_SEC) {
      open.eps.push(episode);
      openSec += sec;
      return;
    }
    // `idx` — the first episode's position in the show's own `episodes`
    // array — isn't needed by any scheduling math here, but persistPool
    // below uses it to store a pool as [showId, idx, count] triples instead
    // of duplicating episode data to localStorage.
    open = { showId: id, show, eps: [episode], idx };
    openSec = sec;
    out.push(open);
  });
  return out;
}

function buildPool(showIds, catalog, seedStr, { ordered = false } = {}) {
  const flat = [];
  for (const id of showIds) {
    const show = catalog.shows[id];
    if (!show) {
      console.warn(`scheduler: channel references unknown show "${id}" — skipping`);
      continue;
    }
    for (const bill of billsFor(id, show)) flat.push(bill);
  }
  const sequence = ordered ? flat : shuffled(flat, seedStr);
  return poolFromSequence(sequence);
}

// Shared tail end of pool-building: turns an already-ordered sequence into
// the {pool, cumulative, totalSec} shape locate() expects. Split out from
// buildPool so loadPersistedPool can reuse it — a rehydrated sequence still
// needs its duration index rebuilt (a plain sum, not the shuffle/hashing work
// persistence exists to skip).
function poolFromSequence(sequence) {
  const cumulative = new Array(sequence.length);
  let acc = 0;
  for (let i = 0; i < sequence.length; i++) {
    cumulative[i] = acc;
    acc += slotFor(billSec(sequence[i]));
  }
  return { pool: sequence, cumulative, totalSec: acc };
}

// -- broken files -------------------------------------------------------------
// archive.org items rot: a file listed in an item's metadata can still 404 or
// refuse to decode. The player reports those here the moment the <video>
// element gives up, and every lookup from then on substitutes past them for
// the rest of the session — so the guide never advertises a programme the
// player already knows it can't show. Session-only on purpose: it's a
// runtime observation, not a fact about the catalog.
const brokenKeys = new Set();

// The next bill at or after `idx` with no known-broken file in it. Falls back
// to the original once it's been all the way round — if every file in a pool
// is dead there's nothing to substitute, and the player shows NO SIGNAL.
const billBroken = (bill) => bill.eps.some((ep) => brokenKeys.has(ep.key));
function usableFrom(pool, idx) {
  if (brokenKeys.size === 0) return pool[idx];
  let i = idx;
  for (let hops = 0; hops < pool.length; hops++) {
    if (!billBroken(pool[i])) return pool[i];
    i = (i + 1) % pool.length;
  }
  return pool[idx];
}

// -- commercials --------------------------------------------------------------
// The spots come from data/commercials.js (tools/build-commercials.py),
// shuffled once with a fixed seed so every break plan below walks the same
// order on every machine.
let adCache = { from: null, spots: [] };
function adSpots() {
  const from = (window.COMMERCIALS && window.COMMERCIALS.spots) || null;
  if (adCache.from !== from) adCache = { from, spots: from ? shuffled(from, "ads:v1") : [] };
  return adCache.spots;
}

// -- break plan ---------------------------------------------------------------
// How one slot is laid out: stretches of programme with commercial breaks
// between them and a last break running up to the next :00/:30. Pure and
// deterministic — a function of the bill, the slot length and the two data
// files (commercials, cut points) — so the player, the guide and any other
// machine all see the same breaks at the same moments.
//
// How many breaks: about one per BREAK_TARGET_SEC of ad time, so 8 minutes of
// ads in a sitcom's half hour is three breaks (two inside, one at the end) and
// 16 minutes in a drama's hour is six. Never so many that an act would run
// shorter than MIN_ACT_SEC.
//
// Where the inside breaks fall, in order of preference:
//   1. between the episodes of a shared bill — the one place a cut is free;
//   2. at a quiet moment near the even split, where data/cuts.js knows of one
//      (a gap in the captions — see tools/build-cuts.py);
//   3. the even split itself. Nothing in the catalog records where a
//      programme's original act breaks were, so this can land mid-scene.
//
// How long each one runs: an inside break is exactly as long as the spots
// chosen for it, so the programme comes back the moment the last ad ends.
// Whatever those breaks didn't use lands in the final one, which is the only
// place a sliver too short for any spot can occur — the player covers it with
// the countdown card, right before the next programme starts on the mark.
const BREAK_TARGET_SEC = 150;
const SPLIT_PAD_SEC = 120;   // less ad time than this stays one break at the end
const MIN_ACT_SEC = 5 * 60;
const SNAP_SEC = 90;         // how far a cut may move to reach a quiet moment
// Coming back from a break the programme resumes this far before the cut.
// Returning means loading the episode's file again and seeking into it, which
// takes a few seconds, while the schedule keeps moving — without the overlap
// every break would swallow the first lines after it.
const RESUME_REWIND_SEC = 3;
const MID_SPOT_MAX_SEC = 125; // no infomercials in the middle of a programme
const AD_LOOKAHEAD = 6;       // spots to pass over looking for one that fits
// Recordings that already carry their own commercials (the taped broadcast
// blocks) aren't interrupted again; their slot's ad time all goes at the end.
const NO_MID_BREAK_GENRES = new Set(["Broadcast Blocks"]);

function nearest(sorted, target, within) {
  let best = null;
  for (const v of sorted) {
    if (Math.abs(v - target) > within) continue;
    if (best === null || Math.abs(v - target) < Math.abs(best - target)) best = v;
  }
  return best;
}

// Bill-timeline seconds at which the inside breaks start. `starts[i]` is where
// episode i begins on that timeline, `total` its full length.
function cutPoints(bill, starts, total, pad) {
  const wanted = pad < SPLIT_PAD_SEC ? 1 : Math.max(2, Math.round(pad / BREAK_TARGET_SEC));
  let inside = Math.min(wanted - 1, Math.max(0, Math.floor(total / MIN_ACT_SEC) - 1));
  const joins = starts.slice(1);
  if (joins.length) {
    // A shared bill only ever breaks between its episodes.
    if (wanted < 2) return [];
    inside = Math.min(Math.max(inside, 1), joins.length);
    const cuts = new Set();
    for (let k = 1; k <= inside; k++) {
      const left = joins.filter((j) => !cuts.has(j));
      cuts.add(nearest(left, (total * k) / (inside + 1), Infinity));
    }
    return [...cuts].sort((a, b) => a - b);
  }
  if (inside <= 0) return [];
  const ep = bill.eps[0];
  const skip = ep.introSkipSec || 0;
  const quiet = ((window.CUTS && window.CUTS[ep.key]) || []).map((t) => t - skip);
  const act = total / (inside + 1);
  const cuts = [];
  for (let k = 1; k <= inside; k++) {
    // Under half an act either way, so snapped cuts can't cross or collide.
    const snapped = nearest(quiet, act * k, Math.min(SNAP_SEC, act * 0.35));
    cuts.push(snapped === null ? act * k : snapped);
  }
  return cuts;
}

function buildPlan(bill, slotSec) {
  const starts = [];
  let total = 0;
  for (const ep of bill.eps) { starts.push(total); total += playableSec(ep); }
  const epAt = (sec) => {
    let i = starts.length - 1;
    while (i > 0 && starts[i] > sec) i--;
    return i;
  };

  const segs = [];
  let clock = 0;
  // Airs [from, to) of the bill's timeline, one segment per episode, never
  // running past the end of the slot.
  const air = (from, to) => {
    for (let i = 0; i < starts.length && clock < slotSec; i++) {
      const lo = Math.max(from, starts[i]);
      const hi = Math.min(to, i + 1 < starts.length ? starts[i + 1] : total);
      if (hi <= lo) continue;
      const len = Math.min(hi - lo, slotSec - clock);
      segs.push({ kind: "show", start: clock, end: clock + len, ep: i, from: lo - starts[i] });
      clock += len;
    }
  };

  const pad = slotSec - total;
  // Only a stand-in for a dead file can be longer than the slot it's given:
  // it airs as far as it gets and is cut off at the mark.
  if (pad <= 0) { air(0, total); return segs; }

  const ads = adSpots();
  let cursor = ads.length ? hashSeed(`ad:${bill.eps[0].key}`) % ads.length : 0;
  const shortest = ads.reduce((min, s) => Math.min(min, s.durationSec), Infinity);
  // Walks on from wherever the last break stopped, so no spot repeats inside
  // one slot until the whole pool has been through.
  const fill = (targetSec, maxSpotSec) => {
    const spots = [];
    let used = 0, misses = 0, tried = 0;
    while (tried < ads.length && misses < AD_LOOKAHEAD && targetSec - used >= shortest) {
      const spot = ads[cursor];
      cursor = (cursor + 1) % ads.length;
      tried++;
      if (spot.durationSec <= targetSec - used && spot.durationSec <= maxSpotSec) {
        spots.push({ spot, at: used });
        used += spot.durationSec;
        misses = 0;
      } else {
        misses++;
      }
    }
    return { spots, used };
  };
  const breakSeg = (index, len, spots, back) => {
    const last = segs[segs.length - 1];
    segs.push({
      kind: "break", start: clock, end: clock + len, index, spots, final: !back,
      // what was on going into the break, and where it had got to
      ep: last ? last.ep : 0, from: last ? last.from + (last.end - last.start) : 0,
      backEp: back ? back.ep : -1, backFrom: back ? back.from : 0,
    });
    clock += len;
  };

  const cuts = ads.length && !NO_MID_BREAK_GENRES.has(bill.show.genre)
    ? cutPoints(bill, starts, total, pad) : [];
  const resumes = cuts.map((cut) =>
    starts.includes(cut) ? cut : Math.max(starts[epAt(cut)], cut - RESUME_REWIND_SEC));
  const rewound = cuts.reduce((sec, cut, k) => sec + (cut - resumes[k]), 0);
  const eachSec = (pad - rewound) / (cuts.length + 1);

  let pos = 0, index = 0;
  cuts.forEach((cut, k) => {
    air(pos, cut);
    const { spots, used } = fill(eachSec, MID_SPOT_MAX_SEC);
    if (!used) { pos = cut; return; } // nothing fit: no break here after all
    const ep = epAt(resumes[k]);
    breakSeg(index++, used, spots, { ep, from: resumes[k] - starts[ep] });
    pos = resumes[k];
  });
  air(pos, total);
  if (clock < slotSec) breakSeg(index, slotSec - clock, fill(slotSec - clock, Infinity).spots, null);
  return segs;
}

// Memoized on the bill. A stand-in airs in someone else's slot, which can be a
// different length from its own, so the slot length is part of the key.
function planFor(bill, slotSec) {
  if (!bill.plan || bill.planSlotSec !== slotSec) {
    bill.plan = buildPlan(bill, slotSec);
    bill.planSlotSec = slotSec;
  }
  return bill.plan;
}

// What's airing `elapsedSec` into a pool's timeline:
//   showId, show, episode  the programme on air (during a break: the one that
//                          was on going into it)
//   bill                   every episode sharing this slot
//   offsetSec              seek position in the episode's airable content
//   padding                true during a commercial break; `break` then says
//                          which spot is on and what comes back after it
//   slotOffsetSec          seconds since this slot started
//   slotEndsInSec          seconds until the next programme starts
//   segmentEndsInSec       seconds until the picture next changes source
//   next                   the following slot's programme
function locate(poolInfo, elapsedSec) {
  const { pool, cumulative, totalSec } = poolInfo;
  if (pool.length === 0 || totalSec <= 0) return null;
  const t = ((elapsedSec % totalSec) + totalSec) % totalSec;
  let lo = 0, hi = pool.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumulative[mid] <= t) lo = mid; else hi = mid - 1;
  }
  const slotOffsetSec = t - cumulative[lo];
  // The grid is measured from the *scheduled* bill, never the substitute — a
  // dead file must not shift it, or channels and the guide would disagree
  // about when the next programme starts. A substitute shorter than the
  // programme it replaced just carries more ads; a longer one is cut off.
  const slotSec = slotFor(billSec(pool[lo]));
  const bill = usableFrom(pool, lo);
  const upNext = usableFrom(pool, (lo + 1) % pool.length);
  const plan = planFor(bill, slotSec);
  const seg = plan.find((s) => slotOffsetSec < s.end) || plan[plan.length - 1];
  const position = {
    showId: bill.showId,
    show: bill.show,
    episode: bill.eps[seg.ep],
    bill: bill.eps,
    offsetSec: seg.from,
    padding: seg.kind === "break",
    slotOffsetSec,
    slotEndsInSec: slotSec - slotOffsetSec,
    segmentEndsInSec: seg.end - slotOffsetSec,
    next: { showId: upNext.showId, show: upNext.show, episode: upNext.eps[0], bill: upNext.eps },
  };
  if (seg.kind === "show") {
    position.offsetSec = seg.from + (slotOffsetSec - seg.start);
    return position;
  }
  const elapsed = slotOffsetSec - seg.start;
  const airing = seg.spots.find((s) => elapsed >= s.at && elapsed < s.at + s.spot.durationSec);
  position.break = {
    index: seg.index,
    count: plan.reduce((n, s) => n + (s.kind === "break"), 0),
    final: seg.final,
    elapsedSec: elapsed,
    endsInSec: seg.end - slotOffsetSec,
    // null once nothing fits what's left of the break: the countdown card
    spot: airing ? airing.spot : null,
    spotOffsetSec: airing ? elapsed - airing.at : 0,
    returning: seg.final ? null
      : { show: bill.show, episode: bill.eps[seg.backEp], offsetSec: seg.backFrom },
  };
  return position;
}

// -- on-device pool cache (localStorage) --------------------------------
// buildPool's real cost is the shuffle + per-episode walk — cheap once per
// page load (poolCache below covers that), but redone from scratch on every
// single reload/app relaunch, since nothing survives a page unload on its
// own. localStorage does survive both (subject to the browser evicting it
// under storage pressure) — treated as a pure best-effort cache throughout:
// any miss, corrupt read, quota error, or disabled storage (private
// browsing, some file:// contexts) just falls back to a normal
// from-scratch build, same as before this existed. Mirrors
// VaultVisionRokuTV's cachefs:/poolcache (source/Scheduler.brs).
//
// The prefix names the pool's *shape*. "h30" is the half-hour grid with shared
// bills; entries under the older "vv.poolcache." keys are per-episode
// sequences, never read again. Change it whenever billsFor's rules change —
// the signature below only notices the catalog moving, not the rules.
const POOL_CACHE_PREFIX = "vv.poolcache.h30.";

// A cheap fingerprint of exactly what `showIds` currently resolves to —
// folded from each show's id/episode-count/summed-runtime, deliberately NOT
// built by walking every episode's individual fields, since avoiding that
// per-episode walk on a cache hit is the whole point of this cache. Keeps a
// stored pool honest without invalidating the other 60-odd channels that
// don't carry whatever show just changed in the catalog.
function poolSignature(showIds, catalog) {
  let joined = "";
  for (const id of showIds) {
    const show = catalog.shows[id];
    if (!show) continue;
    const dur = show.episodes.reduce((a, e) => a + (e.durationSec || 0), 0);
    joined += (joined ? "|" : "") + `${id}#${show.episodes.length}#${dur}`;
  }
  return String(hashSeed(joined));
}

// Rehydrates a pool stored as [[showId, idx, count], ...] back into real
// bills against the live catalog — the stored value never duplicates episode
// data, just where to find it. Returns null on absolutely anything unexpected
// (missing key, bad JSON, signature mismatch, a showId/idx that no longer
// resolves) so the caller always has a clean, uniform "just rebuild it"
// fallback.
function loadPersistedPool(cacheKey, signature, catalog) {
  try {
    const raw = localStorage.getItem(POOL_CACHE_PREFIX + cacheKey);
    if (!raw) return null;
    const stored = JSON.parse(raw);
    if (stored.signature !== signature || !Array.isArray(stored.seq)) return null;
    const sequence = new Array(stored.seq.length);
    for (let i = 0; i < stored.seq.length; i++) {
      const [showId, idx, count] = stored.seq[i];
      const show = catalog.shows[showId];
      const eps = show && show.episodes.slice(idx, idx + count);
      if (!eps || !count || eps.length !== count) return null; // vanished since this was written
      sequence[i] = { showId, show, eps, idx };
    }
    return poolFromSequence(sequence);
  } catch {
    return null;
  }
}

function persistPool(cacheKey, signature, info) {
  try {
    const seq = info.pool.map((b) => [b.showId, b.idx, b.eps.length]);
    localStorage.setItem(POOL_CACHE_PREFIX + cacheKey, JSON.stringify({ signature, seq }));
  } catch {
    // quota exceeded, storage disabled, etc. — fine, just means no
    // persistence this time; the in-session poolCache below still applies.
  }
}

const poolCache = new Map(); // cacheKey -> poolInfo, memoized for this page load
function cachedPool(cacheKey, showIds, catalog, seedStr, opts) {
  let info = poolCache.get(cacheKey);
  if (!info) {
    const signature = poolSignature(showIds, catalog);
    info = loadPersistedPool(cacheKey, signature, catalog);
    if (!info) {
      info = buildPool(showIds, catalog, seedStr, opts);
      persistPool(cacheKey, signature, info);
    }
    poolCache.set(cacheKey, info);
  }
  return info;
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
//   a position as described at locate() | null (empty pool)
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
// Exposed for the manual test harness and for anything that wants to reason
// about determinism directly.
const _internal = { hashSeed, mulberry32, shuffled, buildPool, locate, windowElapsedSec, slotFor,
                    playableSec, billsFor, billSec, planFor, adSpots, brokenKeys, poolSignature,
                    loadPersistedPool, persistPool, POOL_CACHE_PREFIX };

window.getPositionAt = getPositionAt;
window.markBroken = (key) => brokenKeys.add(key);
window.isBroken = (key) => brokenKeys.has(key);
window.EPOCH_MS = EPOCH_MS;
window.SLOT_SEC = SLOT_SEC;
window.playableSec = playableSec;
window.SCHEDULER_INTERNAL = _internal;
