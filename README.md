# VaultVisionTV

A simulated 90s cable box. Flip channels and land mid-show, exactly like real
broadcast TV — because every channel's schedule is computed deterministically
from wall-clock time, not chosen by you. Come back an hour later and it's
moved on without you.

It's a companion to [VaultVision](https://github.com/chairpants/VaultVision),
which hosts no video itself — every show is a pointer into archive.org. This
app reuses that same library as its program source instead of duplicating it:
a build-time script pulls VaultVision's show/episode/duration metadata into
`data/catalog.js`, and the app streams the same archive.org files directly.

## Running it

No build step, no backend, no server required — just open `index.html`
directly (double-click it, or drag it into a browser tab).

That works because every file here is a plain classic `<script src>`, not an
ES module — Chrome refuses to load `import`/`export` modules over `file://`
at all (a hard restriction, not a CORS header you can satisfy), so
`index.html` loads `data/catalog.js`, `channels.js`, `scheduler.js`, etc. in
order as ordinary scripts that assign onto `window`, the same trick
VaultVision itself uses for `shows.js`/`data.js`. A local HTTP server works
too if you prefer one (`python3 -m http.server 8080`), but isn't required.

## Refreshing the catalog

Whenever VaultVision's library grows:

```bash
python3 tools/build-catalog.py            # from the live site
python3 tools/build-catalog.py ../VaultVision   # from a local checkout
```

The second form reads `shows.js`/`data.js` off disk, for content that's added
locally but not pushed yet. Poster URLs still point at the live site either
way, so new art 404s until VaultVision is pushed.

Fetches `shows.js` + every show's `data.js` from the live VaultVision site,
parses them with a vendored copy of VaultVisionRoku's `jsdata.py` (the same
literal-only subset of JS both projects' `data.js` files are constrained to),
and writes both `data/catalog.js` (`window.CATALOG = {...};`, what the app
actually loads) and `data/catalog.json` (same data, kept for tooling/diffing).

## Layout

| File | Role |
|---|---|
| `tools/build-catalog.py` | offline fetch + parse → `data/catalog.js` (+ `.json`) |
| `channels.js` | the channel lineup: genre channels (auto pool) + curated dayparted channels |
| `scheduler.js` | pure scheduling math — deterministic pool + "what's airing at time T" |
| `player.js` | `<video>` wiring: tune, resolve archive.org URL, drift/advance resync, OSD, picture crop, intro skip |
| `remote.js` | keyboard + on-screen remote input |
| `guide.js` | the scrolling TV Guide channel |
| `app.js` | glue |
| `tools/check-channels.js` | channel pools vs the catalog (`node tools/check-channels.js`) |
| `tools/check-vod.js` | walks the VOD menu levels (`node tools/check-vod.js`) |

## Controls

Digits tune directly (auto-commits after a pause, or press Enter). `[`/`]` or
Page Up/Down step channels. `g` jumps to the guide. All of it is also
clickable on the on-screen remote.

## Credits

- Every show streamed here is hosted by **the Internet Archive**
  (archive.org) via VaultVision's cataloging — see VaultVision's own
  `CREDITS.md` per show for sourcing/attribution details. This project hosts
  no video content itself.
- **VCR OSD Mono** typeface by Riciery Leal, vendored from VaultVision's copy
  — the on-screen display font.
- `tools/jsdata.py` is vendored from VaultVisionRoku's `tools/jsdata.py`.
