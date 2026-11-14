# VaultVisionTV

[![Live demo](https://img.shields.io/badge/live%20demo-chairpants.github.io%2FVaultVisionTV-ff2d95?style=flat-square)](https://chairpants.github.io/VaultVisionTV/)
![No build step](https://img.shields.io/badge/build%20step-none-34e0ff?style=flat-square)
![No backend](https://img.shields.io/badge/backend-none-b23bff?style=flat-square)
![Vanilla JS](https://img.shields.io/badge/dependencies-vanilla%20JS-8fe8ff?style=flat-square)

A simulated 90s cable box, in the browser. Flip channels and land mid-show,
exactly like real broadcast TV — every channel's schedule is computed
deterministically from wall-clock time, not chosen by you. Tune to channel 4
now, come back an hour from now, and it's moved on without you, the same way
it would have moved on for anyone else watching.

![Live channel view](docs/screenshots/live.png)

## The idea

Streaming turned TV into an on-demand jukebox: pick anything, pause it
anywhere, pick up exactly where you left off. That's convenient, but it threw
out something real about the old cable-box experience — channels that keep
running whether or not you're watching, so flipping to one drops you into a
show already in progress, and the only way to "catch it from the beginning"
is to have been there when it started.

VaultVisionTV rebuilds that feeling on top of a library of classic TV and
movies streamed straight from the Internet Archive. **68 channels** —
organized by original broadcast network (ABC, CBS, NBC, Fox, Nickelodeon,
MTV, first-run syndication) as well as by genre, era, and a premium movie
tier — each run their own independent, deterministic schedule computed from
the current time, spanning **510 shows**, **399 movies** and **~36,150
episodes**. There's no "state" to keep in sync between sessions or devices:
the schedule is pure math over the clock, so any two people tuned to the same
channel at the same moment see the same thing, automatically.

## Features

- **Deterministic scheduling** — every channel's lineup is derived purely
  from wall-clock time. No server, no database, no per-viewer state; the
  schedule is the same for everyone, all the time, forever.
- **A real channel lineup** — 68 channels split between network-affiliate
  style channels, genre/theme channels (sitcoms by decade, anime,
  anthology/horror, kids' programming, and more), and the VBO movie tier,
  each with its own on-screen identity and tagline.
- **A premium movie tier** — VBO and VBO 2 carry all 399 films, sharing one
  library on two different shuffles the way a real movie channel's second
  feed did, with FAMILY, DRAMA, COMEDY, ACTION, HORROR and HOLIDAY alongside them.
- **Dayparted programming blocks** — network channels shift their pool by
  time of day and day of week, recreating blocks like Friday-night sitcom
  lineups or Saturday-morning cartoons the way real affiliates ran them,
  falling back to regular filler outside those windows.
- **A half-hour grid** — every programme starts on :00 or :30. A 22-minute
  sitcom holds a half-hour slot, a 44-minute drama an hour, and shorts share
  one: two 11-minute cartoons, or a run of Schoolhouse Rocks, air back to
  back in the same half hour.
- **Commercial breaks, where they used to be** — the time a programme doesn't
  fill is spread through it as several short breaks rather than stacked at
  the end: about three in a sitcom's half hour, six in a drama's hour. The
  spots are ~2,100 real commercials and promos from the late 80s through the
  2000s, and none repeats within a slot. A lower-third chyron counts down to
  the programme coming back, or to what's up next.
- **A live TV Guide** — press `g` to pull up a scrolling grid of every
  channel's current and upcoming lineup, with the live picture docked in the
  corner the whole time.

  ![TV Guide](docs/screenshots/guide.png)

- **Video On Demand** — press `v` to step outside the live simulation
  entirely and browse the full library — split into SHOWS and MOVIES, then by
  genre, show, and season — and play and seek any episode on demand.

  ![Video On Demand browse](docs/screenshots/vod.png)

- **A real remote** — every action is on the keyboard (digits to tune,
  `[`/`]` or Page Up/Down to step channels, arrow keys for volume/seek, `m`
  to mute, `r` for last channel) and mirrored on a clickable on-screen remote
  that slides up on hover.

  ![On-screen remote](docs/screenshots/remote.png)

- **Retro CRT styling** — a cable-box OSD rendered in VCR OSD Mono, with
  picture cropping to trim black bars/watermark panels baked into some source
  rips, and intro-skip so scheduling lands on the actual show rather than a
  bumper.
- **No backend, no build step** — every show is a direct stream from
  archive.org; the app itself is static files you can open straight off disk.

## Running it

No build step, no backend, no server required — just open `index.html`
directly (double-click it, or drag it into a browser tab).

That works because every file here is a plain classic `<script src>`, not an
ES module — Chrome refuses to load `import`/`export` modules over `file://`
at all (a hard restriction, not a CORS header you can satisfy), so
`index.html` loads `data/catalog.js`, `channels.js`, `scheduler.js`, etc. in
order as ordinary scripts that assign onto `window`. A local HTTP server
works too if you prefer one (`python3 -m http.server 8080`), but isn't
required.

## Controls

Digits tune directly (auto-commits after a pause, or press Enter). `[`/`]` or
Page Up/Down step channels. Arrow keys adjust volume/seek. `m` mutes, `r`
returns to the last channel, `g` jumps to the guide, `v` opens Video On
Demand. All of it is also clickable on the on-screen remote.

## Refreshing the catalog

```bash
python3 tools/build-catalog.py            # from the live site
python3 tools/build-catalog.py ../VaultVision   # from a local checkout
```

Fetches the source library's show/episode metadata, parses it with a
vendored copy of `jsdata.py` (a literal-only subset-of-JS parser), and writes
both `data/catalog.js` (`window.CATALOG = {...};`, what the app actually
loads) and `data/catalog.json` (same data, kept for tooling/diffing).

The second form reads that metadata off disk instead, for content added to a
local library checkout but not published yet. Poster URLs still point at the
published site either way, so new art 404s until that side is pushed.

## Commercials and break points

```bash
python3 tools/build-commercials.py          # data/commercials.js — the spot pool
python3 tools/build-cuts.py ../VaultVision  # data/cuts.js — where breaks may cut in
```

`build-commercials.py` lists the spots in a set of archive.org collections
(one commercial per file), screening them by filename: adult services,
captures the uploader marked as damaged, and stretches of taped programmes
are left out. Nobody has watched all of them — if one airs that shouldn't,
add its filename to `EXCLUDE_TITLES` and re-run.

Where a break falls inside a programme is, in order of preference: between
two shorts sharing a slot; at a pause in the dialogue near the even split,
for the few shows with bundled captions (`build-cuts.py` finds those pauses);
otherwise at the even split, which can land mid-scene — the catalog has no
record of where the original act breaks were. Coming back from a break the
programme rewinds a few seconds, so the reload doesn't swallow a line.

`node tools/check-breaks.js` plans every slot in the catalog and checks the
whole arrangement: starts on the half hour, programmes airing complete and in
order, breaks spread out, no repeated spot in a slot.

## Layout

| File | Role |
|---|---|
| `tools/build-catalog.py` | offline fetch + parse → `data/catalog.js` (+ `.json`) |
| `tools/build-commercials.py` | archive.org commercial collections → `data/commercials.js` |
| `tools/build-cuts.py` | VaultVision's bundled captions → `data/cuts.js` (quiet moments to cut on) |
| `channels.js` | the channel lineup: genre channels (auto pool) + curated dayparted channels |
| `scheduler.js` | pure scheduling math — deterministic pool, the half-hour grid, each slot's break plan, "what's airing at time T" |
| `player.js` | `<video>` wiring: tune, resolve archive.org URL, drift/advance resync, OSD, picture crop, intro skip |
| `remote.js` | keyboard + on-screen remote input |
| `guide.js` | the scrolling TV Guide channel |
| `vod.js` | the Video On Demand browse menu |
| `app.js` | glue |
| `tools/check-items.py` | asks archive.org whether every item still plays (`python3 tools/check-items.py`) |
| `data/removals.md` | log of shows dropped from the catalog, and why — written by the rebuild |
| `tools/check-channels.js` | channel pools vs the catalog (`node tools/check-channels.js`) |
| `tools/check-vod.js` | walks the VOD menu levels (`node tools/check-vod.js`) |
| `tools/check-breaks.js` | every slot's grid and break plan (`node tools/check-breaks.js`) |

## Credits

- Every show streamed here is hosted by **the Internet Archive**
  (archive.org). This project hosts no video content itself.
- **VCR OSD Mono** typeface by Riciery Leal — the on-screen display font.
