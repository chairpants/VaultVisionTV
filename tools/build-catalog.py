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
OUT_JSON = Path(__file__).parent.parent / "data" / "catalog.json"
OUT_JS = Path(__file__).parent.parent / "data" / "catalog.js"

# archive.org items that no longer exist — /metadata/<id> answers {"error": ...}
# because the item was darkened or withdrawn. VaultVision still lists them, so
# they come back on every rebuild unless dropped here. The player copes (no
# playable file -> markBroken -> failOver), but only after a wasted metadata
# round trip and a visible failover, and the guide still advertises them.
# Re-check with: curl -s https://archive.org/metadata/<id>
DEAD_ITEMS = {
    "myopic-vhs-no-08",                      # Sci-Fi Saturday Anime, 7.70h
    "stephen-kings-the-langoliers-1995-hd",  # The Langoliers (1995), 3.00h
}

# Whole shows VaultVision lists but this app deliberately doesn't carry, for
# reasons that have nothing to do with the files being broken (that's
# DEAD_ITEMS above). Excluding the show here -- rather than just leaving it
# off every channel's pool -- means it structurally can't resurface: a genre
# channel sweeps every show of its genre with no per-show opt-out list to
# remember to update, so a show excluded only at the channel layer stays one
# future genre-channel addition away from quietly coming back.
EXCLUDED_SHOWS = {
    "USAUpAllNight",  # leaned heavily on tasteless content with no redeeming value
}

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
}
FALLBACK_DEFAULT_SEC = 22 * 60


def fetch(path):
    url = f"{BASE}/{path}"
    with urllib.request.urlopen(url, timeout=30) as r:
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


def build_show_entry(row):
    show_id = row["id"]
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
        "artUrl": f"{BASE}/art/{show_id}.{row['ext']}",
        "grouping": grouping,
        "totalDurationSec": sum(ep["durationSec"] for ep in episodes),
        "episodes": episodes,
    }


def main():
    print(f"fetching show list from {BASE}/shows.js ...")
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

    total_eps = sum(len(s["episodes"]) for s in shows.values())
    catalog = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sourceBase": BASE,
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
