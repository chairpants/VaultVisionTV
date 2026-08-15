// Walks vod.js's menu against data/catalog.json the way a click would, one
// level at a time, and asserts it lands where it should. The nav is a stack of
// five levels whose meaning depends on depth (section, genre, show, season,
// episode) -- exactly the shape that breaks silently when a level is inserted,
// which is what happened when SHOWS/MOVIES went in above the genres.
//
//   node tools/check-vod.js
//
// A DOM stub, not a browser: vod.js only ever touches innerHTML, textContent,
// classList, scrollTop and one click listener, so those are all that's here.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let rowsHtml = '';
let crumb = '';
let onClick = null;

const rowsEl = {
  set innerHTML(v) { rowsHtml = v; }, get innerHTML() { return rowsHtml; },
  scrollTop: 0,
  addEventListener: (_type, fn) => { onClick = fn; },
};
const crumbEl = { set textContent(v) { crumb = v; }, get textContent() { return crumb; } };
const rootEl = {
  innerHTML: '',
  classList: { add() {}, remove() {}, contains: () => false },
  querySelector: (sel) => (sel === '#vod-rows' ? rowsEl : crumbEl),
};

global.window = {};
global.document = { addEventListener() {} };
eval(fs.readFileSync(path.join(root, 'data/catalog.js'), 'utf8'));
eval(fs.readFileSync(path.join(root, 'channels.js'), 'utf8'));   // MOVIE_GENRES
eval(fs.readFileSync(path.join(root, 'vod.js'), 'utf8'));

const labels = () => [...rowsHtml.matchAll(/data-idx="\d+">([^<]*)</g)].map((m) => m[1]);
// Row 0 is the BACK/EXIT row on every level; `rows()` is the list proper.
const rows = () => labels().slice(1);
const click = (i) => onClick({ target: { closest: () => ({ dataset: { idx: String(i) } }) } });
const pick = (prefix) => {
  const i = labels().findIndex((l) => l.startsWith(prefix));
  assert.notStrictEqual(i, -1, `no row starting "${prefix}" in [${rows().slice(0, 5)}]`);
  click(i);
};

let played = null;
const vod = createVod({
  root: rootEl,
  catalog: window.CATALOG,
  playEpisode: (show, ep) => { played = `${show.title} | ${ep.movieTitle || ep.code}`; },
  onExit: () => { played = 'EXIT'; },
});

vod.show();
assert.strictEqual(labels()[0], '‹ EXIT TO TV', 'top level offers a way out of VOD');
assert.deepStrictEqual(rows().map((l) => l.split('  ')[0]), ['SHOWS', 'MOVIES']);

// Movies: section -> genre -> film, which plays on the spot (one episode, so
// there's no episode list worth showing).
pick('MOVIES');
assert.strictEqual(labels()[0], '‹ BACK', 'below the top level the row goes up, not out');
const movieGenres = rows().map((l) => l.replace(/&amp;/g, '&').split('  (')[0]);
assert.deepStrictEqual(movieGenres, window.MOVIE_GENRES,
  'MOVIES side should be exactly the genres the VBO channels sweep');
pick('Horror');
const firstFilm = rows()[0];
click(1);
assert.ok(played && played.startsWith(firstFilm), `clicking "${firstFilm}" should play it, got ${played}`);
assert.ok(crumb.startsWith('MOVIES   /   Horror'), `breadcrumb stayed put: ${crumb}`);

// Shows: the full section -> genre -> show -> season -> episode ladder.
vod.back(); vod.back();
assert.strictEqual(crumb, '', 'two Backs from a genre list should reach the top');
pick('SHOWS');
assert.ok(!rows().some((l) => window.MOVIE_GENRES.includes(l.replace(/&amp;/g, '&').split('  (')[0])),
  'no film genre may appear on the SHOWS side');
pick('Animation');
pick('Batman: The Animated');
assert.ok(rows()[0].startsWith('Season 1'), `expected a season list, got ${rows()[0]}`);
click(2); // row 0 is BACK, so Season 2 is row 2
assert.ok(/Season 2$/.test(crumb), `breadcrumb should name the season: ${crumb}`);
assert.ok(rows()[0].startsWith('S02E01'), `season 2 should list S02 episodes, got ${rows()[0]}`);
click(1);
assert.strictEqual(played, 'Batman: The Animated Series | S02E01');

// The BACK row is the whole ladder in reverse, and exits at the top.
click(0); assert.ok(/Batman/.test(crumb) && !/Season/.test(crumb), `back to seasons: ${crumb}`);
click(0); click(0); click(0);
assert.strictEqual(crumb, '', `four Backs from an episode list reach the top: ${crumb}`);
played = null;
click(0);
assert.strictEqual(played, 'EXIT', 'BACK at the top level exits VOD');

const shows = Object.values(window.CATALOG.shows);
const films = shows.filter((s) => window.MOVIE_GENRES.includes(s.genre));
console.log(`ok - ${shows.length - films.length} shows, ${films.length} movies`);
