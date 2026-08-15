// Sanity-checks channels.js against data/catalog.json. Run after any catalog
// rebuild -- tools/build-catalog.py can drop a show (see the Seinfeld/Roseanne
// removal) and nothing else in the app notices until a channel tries to air it.
//
//   node tools/check-channels.js
//
// Exits non-zero on a real breakage (unknown show id, duplicate entry in one
// pool). Thin pools and cross-channel overlap only print -- some of both is
// deliberate, so they're reported for a human to judge, not failed on.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cat = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog.json'), 'utf8'));
global.window = {};
eval(fs.readFileSync(path.join(root, 'channels.js'), 'utf8'));
const CH = global.window.CHANNELS;

const SLOT = 300; // scheduler.js rounds every episode up to a 5-minute slot
const poolHours = (ids) => ids.reduce((total, id) => {
  const show = cat.shows[id];
  if (!show) return total;
  return total + show.episodes.reduce((a, e) =>
    a + Math.ceil(Math.max(1, e.durationSec - (e.introSkipSec || 0)) / SLOT) * SLOT, 0);
}, 0) / 3600;

const allIds = (ch) => [
  ...(ch.fallbackPool || []),
  ...(ch.daypart || []).flatMap((d) => d.pool),
];

let failures = 0;
const fail = (msg) => { console.log('FAIL  ' + msg); failures++; };

// -- hard errors ------------------------------------------------------------
for (const ch of CH) {
  const pools = [['fallback', ch.fallbackPool || []]];
  (ch.daypart || []).forEach((d, i) => pools.push([`window${i}`, d.pool]));
  for (const [label, pool] of pools) {
    for (const id of pool) {
      if (!cat.shows[id]) fail(`ch${ch.number} ${label}: unknown show "${id}"`);
    }
    const dups = [...new Set(pool.filter((v, i) => pool.indexOf(v) !== i))];
    if (dups.length) fail(`ch${ch.number} ${label}: listed twice - ${dups.join(', ')}`);
  }
  for (const id of ch.excludeShowIds || []) {
    if (!cat.shows[id]) fail(`ch${ch.number} excludeShowIds: unknown show "${id}"`);
  }
  if (ch.kind === 'curated' && !(ch.fallbackPool || []).length) {
    fail(`ch${ch.number} has no fallbackPool - it would go dark outside its daypart`);
  }
}

// Windows on one channel must not overlap; the scheduler takes the first match.
for (const ch of CH) {
  const seen = new Map();
  for (const d of ch.daypart || []) {
    for (const day of d.days) {
      for (let h = d.startHour; h < d.endHour; h++) {
        const key = `${day}:${h}`;
        if (seen.has(key)) fail(`ch${ch.number}: two windows both cover day ${day} hour ${h}`);
        seen.set(key, true);
      }
    }
  }
}

// -- reports (not failures) -------------------------------------------------
const reachable = new Set();
for (const ch of CH) {
  if (ch.kind === 'genre') {
    for (const [id, show] of Object.entries(cat.shows)) {
      if ([].concat(ch.genre).includes(show.genre) &&
          !(ch.excludeShowIds || []).includes(id)) reachable.add(id);
    }
  }
  for (const id of allIds(ch)) reachable.add(id);
}
const orphans = Object.keys(cat.shows).filter((id) => !reachable.has(id));
console.log(`shows in catalog: ${Object.keys(cat.shows).length}`);
console.log(`airing nowhere:   ${orphans.length}${orphans.length ? ' -> ' + orphans.join(', ') : ''}`);

const thin = CH
  .filter((ch) => ch.kind === 'curated')
  .map((ch) => ({ ch, h: poolHours(ch.fallbackPool || []) }))
  .filter((x) => x.h < 24);
if (thin.length) {
  console.log('\nfallback pools that repeat inside 24h (a dayparted channel airs');
  console.log('its fallback every hour outside its window, so this is what the');
  console.log('channel mostly *is*):');
  for (const { ch, h } of thin) {
    console.log(`  ch${String(ch.number).padStart(2)} ${ch.name.padEnd(28)} ${String(ch.fallbackPool.length).padStart(2)} shows  ${h.toFixed(1)}h`);
  }
}

console.log(failures ? `\n${failures} failure(s)` : '\nok');
process.exit(failures ? 1 : 0);
