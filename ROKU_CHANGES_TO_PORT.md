# Changes made in VaultVisionRokuTV worth porting back here

While building the Roku port (`VaultVisionRokuTV`, a sibling project), a few
changes came out of it that aren't Roku-specific — they're just better, and
this project should have them too. This doc describes each one: what
changed, why, and where it'd land in this codebase's actual files.

**Status: all six items below have been ported.** This is now a log of
completed work, not a to-do list — kept around for the reasoning behind each
change. One more bug surfaced independently during the Roku work and got
fixed here too, unrelated to the six below: `player.js`'s `resolveEpisodeUrl`
could pick an archive.org item's silent original file over its web-safe
`.ia.mp4` derivative when the catalog's `fileHint` already looked like a
playable filename (e.g. Xena) — fixed to check each file's `original` field
first.

## 1. Mini-guide layout: video docked top-right, not full-screen-behind-a-tint

**What changed:** The TV Guide overlay used to be a semi-transparent tint
over the full-screen video with a header/date and a scrolling channel list.
It's now a proper mini-guide layout: the live video shrinks into the
top-right quarter of the screen, an info panel in the top-left describes
whatever channel is currently highlighted (number, name, tagline, and a live
look at what's airing there right now), and the channel listings run across
the full width of the bottom half, with real "NOW / +30 / +60" time-column
headers above the rows.

**Why:** It reads much more like an actual cable box's guide (video stays
visible while you browse) instead of a tinted-overlay list. It also gives
somewhere to put per-channel detail (the info panel) that the old layout had
no room for.

**Where this lands in VaultVisionTV:** `guide.js` (the whole render/layout
approach) and `style.css` (`#guide` and its children need the three-region
layout: a video-sized box top-right — CSS can literally just resize/reposition
the `<video>` element itself via a class toggle when the guide is open, which
is much easier here than it was on Roku, since browsers don't have the same
resize/reposition restrictions on `<video>` that a Roku `Video` node turned
out to have — an info panel top-left, and the listings grid spanning the
bottom, header row included). The current scroll-hold-wipe animation cycle in
`guide.js` can stay if you like the ambient auto-scroll (it exists mainly
because the web build has a mouse; Roku's port switched to D-pad-driven
scroll for hardware reasons that don't apply to a mouse-and-keyboard target,
so no need to change that behavior here unless you want to).

## 2. Commercial pool: several new archive.org source items

**What changed:** `tools/build-commercials.py` now pulls from more than one
archive.org item and merges the results into one pool, instead of just
`Collectionof90sCommercials`. Sources added: a 1990s infomercial-clips
collection, a couple of single-spot items (a Philips CD-i ad, several
Sony/Nintendo/Sega game-console commercials from the early-to-mid 90s), and
one deliberately long infomercial (a ~12.7-minute George Foreman Grill spot)
specifically so the longest slot-padding windows have something that can
actually fill them instead of falling back to the "STAND BY" countdown card
every time.

**Why:** More variety, and specifically: without at least one long-form spot
in the pool, `getAdAt()` can never select anything for a padding window
longer than the longest available ad, no matter how much dead air there is
to fill.

**Where this lands in VaultVisionTV:** `tools/build-commercials.py`. The
Roku version's script (`VaultVisionRokuTV/tools/build-commercials.py`) is a
good reference for the exact item ID list and the merge logic — it's nearly
line-for-line portable, the only Roku-specific bit is that it writes plain
JSON instead of the `window.COMMERCIALS = ...`-wrapped `.js` file this
project needs; keep this project's existing wrapper-writing behavior and
just adopt the multi-item merge + item list.

## 3. Commercial pool build script: exclusions + a much higher duration cap

**What changed, in the same script:**
- A hand-curated `EXCLUDE_TITLES` set, matched by exact filename, drops a
  handful of adult-service spots (phone-sex-line ads, a Playboy subscription
  ad) that were mixed into an otherwise-fine 90s infomercial collection.
  Matched by exact filename on purpose rather than a keyword filter, since
  the source collections are small enough to hand-verify precisely and a
  keyword filter risks both false positives and false negatives.
- `MAX_SEC` (the upper bound on what counts as a plausible single "spot"
  rather than bad metadata or a whole-reel upload) went from 180 seconds to
  1800 — specifically to let the new long-form infomercial (see #2) through
  the filter at all.
- The script also dedupes `<name>.ia.mp4` archive.org auto-transcode
  derivatives against the plain `<name>.mp4` original when a source item
  has both (same spot, same runtime, two files) — keeping both would just
  double that spot's odds of being picked for no real variety.

**Where this lands:** Same file, `tools/build-commercials.py`. Both the
`EXCLUDE_TITLES` set and the dedup logic are easy, self-contained additions.

## 4. Shows removed from the channel lineup

**What changed, in `channels.js`:**
- **Roseanne** and **Seinfeld** — removed entirely (were in `TGIF SITCOMS`'s
  and `LATE SHOW`'s pools). Both of these archive.org items turned out to be
  locked to browser-only playback (no direct file access), so they can't
  actually be streamed by either this project or the Roku port.
- **LivePD** (`LivePDSeriesNotDoneYet`) — removed from `TRUE CRIME TONIGHT`'s
  curated pool. Its archive.org files consistently error out
  ("technical difficulties" — the file lists metadata but doesn't actually
  play).

**Why this needs a second pass here specifically:** on the Roku port, pulling
a show out of a curated pool wasn't enough by itself — genre channels
(`kind: "genre"`) sweep in *every* catalogued show with a matching `genre`
tag automatically, with zero curation, so a show removed from one curated
channel can still resurface on its genre channel. That happened twice during
the Roku work (see #6 below for the general mechanism) — worth specifically
double-checking whether `LivePDSeriesNotDoneYet` (tagged `"Reality TV"`) or
either sitcom (`"Sitcoms"`/`"Classic Sitcoms"`) still shows up via
`REALITY CHECK`, `SITCOM CENTRAL`, or `CLASSIC TV` here, since this project's
`channels.js` has the same "genre channel = everything with that tag" design
scheduler.js already documents.

## 5. Program grid: 5 minutes, not 30 — cuts the end-of-block commercial tail

**What changed:** `scheduler.js`'s `SLOT_SEC` (the grid every program start
time snaps to) was `30 * 60`. On the Roku port it's `5 * 60`.

**Why:** Every episode rounds *up* to the next whole multiple of `SLOT_SEC`,
and the leftover gap between where the episode actually ends and that
boundary is exactly what fills with commercials/padding. At a flat 30-minute
grid, a typical ~22-minute sitcom or cartoon always left an 8-minute
commercial tail — every airing, every channel, no exceptions, since a
22-minute show can only round up to the *next* 30-minute mark. At a 5-minute
grid, that same 22-minute episode only rounds up to 25 minutes — a 3-minute
tail instead of 8. Programs still start on a clean, deterministic grid mark
(the whole scheduling model is unchanged), it's just a finer one.

**One coupled change that has to travel with it:** `guide.js`'s TV Guide
column headers ("NOW", "+30", "+60") were computed directly from
`SLOT_SEC` in the Roku version originally, which meant shrinking the grid
would have also shrunk what the guide's columns *meant* (showing "+5 min" /
"+10 min" instead of real half-hour lookaheads) — a real TV Guide's columns
mean literal 30/60-minute lookaheads regardless of how finely a station
grids its own programming underneath. The fix was a second, independent
constant (`Vv_GuideColumnSec()` on Roku, fixed at 1800 regardless of the
scheduling grid) used only for the guide's own display columns. Check
whether `guide.js` here computes its column headers from the same `SLOT_SEC`
scheduler.js exports — if so, it needs the same decoupling, or shrinking the
grid will visibly break the guide's column labels.

**Where this lands:** `scheduler.js` (`SLOT_SEC` itself, and its own header
comment, which currently explains/justifies the 30-minute assumption and
would need updating) and `guide.js` (decouple the column-header time labels
from `SLOT_SEC` if they aren't already independent).

## 6. (Bonus, not explicitly requested but related) Genre-channel exclusions

Not asked for, but came up twice while doing #4 above and is worth knowing
about: the Roku port added an optional `excludeShowIds` field to genre
channel definitions, letting a specific show opt out of an otherwise
zero-curation genre pool. Concretely: adult animation (Big Mouth, Duckman,
Drawn Together, and several others — all tagged genre `"Animation"` same as
every kids' cartoon) was bleeding into `TOON CHANNEL` despite already having
a proper curated home on a late-night-cartoons channel, and `LivePD` (see
#4) kept resurfacing on `REALITY CHECK` after being pulled from its curated
channel, for the exact same reason. If this project's `channels.js` /
`scheduler.js` don't already have an equivalent, it's a small, contained
addition (`Scheduler.brs`'s `Vv_GenrePool` on the Roku side is the reference
implementation) and would fix the same category of issue here.
