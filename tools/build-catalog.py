#!/usr/bin/env python3
"""Build data/catalog.json from the live VaultVision site.

VaultVision (https://chairpants.github.io/VaultVision) hosts no video itself —
every show is a pointer list into archive.org plus a poster. This script pulls
that pointer data (shows.js's genre/title list, then each show's data.js
episode+duration list) and flattens it into one JSON file our runtime app can
fetch from its own origin, so the browser never needs to touch VaultVision's
site at all except for <img> poster URLs (which don't need CORS).

Re-run manually whenever VaultVision's library grows:
    python3 tools/build-catalog.py
"""
import csv
import io
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from jsdata import JsParseError, parse_show  # noqa: E402

BASE = "https://chairpants.github.io/VaultVision"
# Where the shows.js/data.js get *read* from. Defaults to the live site; pass a
# path to a local VaultVision checkout to build from content that isn't pushed
# yet (`python3 tools/build-catalog.py ../VaultVision`). Poster URLs still point
# at BASE either way — art is served from the live site, not from here, so a
# local build just means the newest posters 404 until VaultVision is pushed.
SOURCE = sys.argv[1] if len(sys.argv) > 1 else BASE
OUT_JSON = Path(__file__).parent.parent / "data" / "catalog.json"
OUT_JS = Path(__file__).parent.parent / "data" / "catalog.js"

# archive.org items nothing can be played from. VaultVision still lists them,
# so they come back on every rebuild unless dropped here. The player copes (no
# playable file -> markBroken -> failOver), but only after a wasted metadata
# round trip and a visible failover, and the guide still advertises them.
#
# Two ways an item lands here, and the second one is invisible to a metadata
# check:
#   * the item is gone   — /metadata/<id> answers {"error": ...} (darkened or
#     withdrawn).
#   * the item is gated  — /metadata/<id> answers 200 and lists every file,
#     but /download/<id>/<file> answers 401/403 to anonymous requests because
#     the item needs an archive.org login. Metadata alone looks perfectly
#     healthy, so check a real file with a range request, the way <video> does.
# Re-check with:
#   curl -s https://archive.org/metadata/<id>
#   curl -s -o /dev/null -L -r 0-1 -w '%{http_code}\n' https://archive.org/download/<id>/<file>
DEAD_ITEMS = {
    "myopic-vhs-no-08",                      # Sci-Fi Saturday Anime, 7.70h
    "stephen-kings-the-langoliers-1995-hd",  # The Langoliers (1995), 3.00h
    # Gated, not gone: collection ["loggedin","deemphasize"] with
    # access-restricted-item true. All 37 files 401 anonymously. This is the
    # whole of upstream's LivePDSeriesNotDoneYet, which therefore drops out
    # with no episodes left — the playable Live PD episodes come from the two
    # opensource_movies items in data/local-shows/LivePD instead.
    "live-pd-complete-series_202311",
    # Found by tools/check-items.py, which sweeps every item the catalog
    # points at rather than waiting for a viewer to hit one.
    "murphy-brown-s09E17-blind-date",  # GONE. 1 of Murphy Brown's 245.
    "dragon-ball-HD-remastered-2022",  # GATED. 1 of Dragon Ball's 153.
    # GATED, and it was Mutant League's whole first season plus a badly named
    # duplicate of its second. Upstream now sources the show from
    # mutant-league_20250130 instead (all 40 episodes, real titles), so this
    # is belt-and-braces in case the old rows ever come back.
    "mutant-league-s-1-e-4",
    # DARK, and each was the *only* source for its show, so both shows leave
    # the catalog entirely until a replacement item is found. That's the
    # honest outcome: better a missing show than a channel that airs 159
    # episodes of nothing.
    "berserk-1997-complete",               # 25 episodes, all of Berserk (1997)
    "designing-women-the-complete-series",  # 159 episodes, all of Designing Women
}

# Whole shows VaultVision lists but this app deliberately doesn't carry, for
# reasons that have nothing to do with whether the files play (that's
# DEAD_ITEMS above -- an unplayable source is a source problem, so it gets
# dropped by item and the show falls out on its own if nothing is left).
# Excluding the show here -- rather than just leaving it off every channel's
# pool -- means it structurally can't resurface: a genre channel sweeps every
# show of its genre with no per-show opt-out list to remember to update, so a
# show excluded only at the channel layer stays one future genre-channel
# addition away from quietly coming back.
EXCLUDED_SHOWS = {
    "USAUpAllNight",  # leaned heavily on tasteless content with no redeeming value
}

# Shows that live in this repo rather than upstream VaultVision, listed in
# data/local-shows/shows.csv with the same columns as upstream's shows.js CSV
# (title,id,genre,ext) and one <id>/data.js each in VaultVision's own format.
# For content VaultVision doesn't carry, or carries only from a source that
# turned out to be unplayable -- a rebuild can't pick those up from upstream by
# definition, so they have to be part of the repo to survive one.
LOCAL_SHOWS_DIR = Path(__file__).parent.parent / "data" / "local-shows"

# Fallback runtime (seconds) for episodes with no entry in a show's
# `durations` map — 22 of VaultVision's shows ship an empty durations map
# entirely (see ADDING_A_SHOW.md), and individual rows can be missing even in
# shows that mostly have them. Typical broadcast length per genre.
GENRE_DEFAULT_SEC = {
    "Animation": 22 * 60,
    "Kids & Educational": 22 * 60,
    "Sitcoms": 22 * 60,
    "Classic Sitcoms": 22 * 60,
    "Anime": 24 * 60,
    "Horror & Anthology": 24 * 60,
    "Sketch Comedy & Late Night": 30 * 60,
    "Drama & Adventure": 44 * 60,
    "Reality TV": 44 * 60,
    "TV Movies": 90 * 60,
    "Broadcast Blocks": 60 * 60,
    # Movie genres (VaultVision's feature-film sections). Every movie so far
    # ships a real duration, so this only covers a future one that doesn't.
    "Action & Adventure": 100 * 60,
    "Comedy": 100 * 60,
    "Drama": 100 * 60,
    "Family & Kids": 100 * 60,
    "Holiday": 90 * 60,
    "Horror": 95 * 60,
    "Sci-Fi & Fantasy": 100 * 60,
}
FALLBACK_DEFAULT_SEC = 22 * 60


def fetch(path):
    if not SOURCE.startswith("http"):
        return (Path(SOURCE) / path).read_text(encoding="utf-8")
    with urllib.request.urlopen(f"{SOURCE}/{path}", timeout=30) as r:
        return r.read().decode("utf-8")


def load_shows_csv():
    text = fetch("shows.js")
    m = re.search(r"window\.SHOWS_CSV\s*=\s*`(.*)`;\s*$", text, re.S)
    if not m:
        raise SystemExit("shows.js: couldn't find window.SHOWS_CSV template literal")
    rows = []
    for row in csv.reader(io.StringIO(m.group(1))):
        if not row:
            continue
        title, show_id, genre, ext = row
        rows.append({"title": title, "id": show_id, "genre": genre, "ext": ext})
    return rows


def episode_key(item_id, file_hint):
    return f"{item_id}::{file_hint}" if file_hint else item_id


def season_and_code(title, grouping):
    """Mirror the player's own parsing: split on ' - ', code is parts[1],
    season comes from /S(\\d+)/i in the code (season 1 if absent)."""
    parts = title.split(" - ")
    code = parts[1] if len(parts) > 1 else ""
    name = " - ".join(parts[2:]) if len(parts) > 2 else ""
    season = 1
    if grouping == "season":
        sm = re.search(r"S(\d+)", code, re.I)
        if sm:
            season = int(sm.group(1))
    return code, name, season


def resolve_crop(show_data, season):
    """{x,y,w,h} fractions of the true picture within the ripped frame, or
    None. Mirrors VaultVision's own cropFor(): cropBySeason wins over crop
    for seasons it covers, per-episode so it can vary as a show pages through
    seasons ripped from different sources."""
    by_season = (show_data.get("cropBySeason") or {}).get(season) or \
        (show_data.get("cropBySeason") or {}).get(str(season))
    return by_season or show_data.get("crop") or None


def resolve_intro_skip(show_data, season):
    """Seconds to skip past baked-in intro footage (a station bumper, an
    uploader's colorization credit) that isn't part of the show. Mirrors
    VaultVision's introSkipFor(): introSkipBySeason wins over the flat
    introSkipSeconds for seasons it covers; 0 means start at the top."""
    by_season = (show_data.get("introSkipBySeason") or {}).get(season)
    if by_season is None:
        by_season = (show_data.get("introSkipBySeason") or {}).get(str(season))
    value = by_season if by_season is not None else show_data.get("introSkipSeconds")
    return int(value) if isinstance(value, (int, float)) else 0


def load_local_shows():
    """[(row, data.js text)] for data/local-shows, same row shape as upstream.

    `row["artUrl"]` is set here because local art sits next to its data.js
    instead of in upstream's flat /art directory."""
    manifest = LOCAL_SHOWS_DIR / "shows.csv"
    if not manifest.exists():
        return []
    out = []
    for row in csv.reader(io.StringIO(manifest.read_text(encoding="utf-8"))):
        if not row or row[0].lstrip().startswith("#"):
            continue
        title, show_id, genre, ext = (c.strip() for c in row)
        data = LOCAL_SHOWS_DIR / show_id / "data.js"
        if not data.exists():
            print(f"  SKIP {show_id}: no {data}", file=sys.stderr)
            continue
        out.append(({
            "title": title, "id": show_id, "genre": genre, "ext": ext,
            "artUrl": f"data/local-shows/{show_id}/{show_id}.{ext}",
        }, data.read_text(encoding="utf-8")))
    return out


def build_show_entry(row, text=None):
    """`text` is the show's data.js; fetched from upstream when not supplied."""
    show_id = row["id"]
    if text is None:
        try:
            text = fetch(f"shows/{show_id}/data.js")
        except Exception as e:
            print(f"  SKIP {show_id}: fetch failed ({e})", file=sys.stderr)
            return None
    try:
        d = parse_show(text)
    except JsParseError as e:
        print(f"  SKIP {show_id}: parse failed ({e})", file=sys.stderr)
        return None

    genre = row["genre"]
    default_sec = GENRE_DEFAULT_SEC.get(genre, FALLBACK_DEFAULT_SEC)
    durations = d.get("durations") or {}
    grouping = d.get("grouping", "season")
    segments = d.get("segments", "none")
    # Under segments:"film" (hosted-movie shows like MonsterVision, tapes of
    # Stephen King TV movies, etc.), the episode's own title is usually just
    # "SHOW - Part 1" — the real film title lives here instead, keyed the
    # same way as durations. Mirrors show.html's own display logic.
    film_map = d.get("film") or {}

    episodes = []
    for i, e in enumerate(d.get("episodes") or []):
        if not isinstance(e, list) or len(e) < 2:
            continue
        item_id = e[0]
        if item_id in DEAD_ITEMS:
            continue
        title = e[1]
        file_hint = e[2] if len(e) > 2 else None
        key = episode_key(item_id, file_hint)
        code, name, season = season_and_code(title, grouping)
        duration_sec = durations.get(key)
        if not isinstance(duration_sec, (int, float)) or duration_sec <= 0:
            duration_sec = default_sec
        episodes.append({
            "key": key,
            "itemId": item_id,
            "fileHint": file_hint,
            "title": title,
            "code": code,
            "name": name,
            "seasonNum": season,
            "durationSec": int(round(duration_sec)),
            "index": i,
            "crop": resolve_crop(d, season),
            "introSkipSec": resolve_intro_skip(d, season),
            "movieTitle": film_map.get(key) if segments == "film" else None,
        })

    if not episodes:
        print(f"  SKIP {show_id}: no usable episodes", file=sys.stderr)
        return None

    return {
        "id": show_id,
        "title": row["title"],
        "genre": genre,
        "artUrl": row.get("artUrl") or f"{BASE}/art/{show_id}.{row['ext']}",
        "grouping": grouping,
        "totalDurationSec": sum(ep["durationSec"] for ep in episodes),
        "episodes": episodes,
    }


def main():
    print(f"fetching show list from {SOURCE}/shows.js ...")
    rows = load_shows_csv()
    print(f"{len(rows)} shows listed")

    shows = {}
    genres = set()
    t0 = time.time()
    for i, row in enumerate(rows, 1):
        if row["id"] in EXCLUDED_SHOWS:
            continue
        entry = build_show_entry(row)
        if entry:
            shows[entry["id"]] = entry
            genres.add(entry["genre"])
        if i % 25 == 0:
            print(f"  ...{i}/{len(rows)}")

    local = load_local_shows()
    if local:
        print(f"adding {len(local)} local show(s) from {LOCAL_SHOWS_DIR} ...")
    for row, text in local:
        entry = build_show_entry(row, text)
        if entry:
            shows[entry["id"]] = entry
            genres.add(entry["genre"])
            print(f"  {entry['id']}: {len(entry['episodes'])} episodes")

    total_eps = sum(len(s["episodes"]) for s in shows.values())
    catalog = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sourceBase": SOURCE,
        "genres": sorted(genres),
        "shows": shows,
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(catalog, indent=1, sort_keys=True)
    OUT_JSON.write_text(payload)
    # The app itself loads catalog.js (plain `<script src>`, assigns
    # window.CATALOG) rather than fetching catalog.json — fetch() of a local
    # file is blocked by Chrome's CORS policy under file://, the same reason
    # VaultVision ships shows.js instead of shows.json. catalog.json is kept
    # too, purely for tooling/diffing convenience (this script's own tests,
    # `python3 -m json.tool`, etc).
    OUT_JS.write_text(f"window.CATALOG = {payload};\n")
    print(f"wrote {OUT_JSON} and {OUT_JS} — {len(shows)} shows, {total_eps} episodes, "
          f"{len(genres)} genres, {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
