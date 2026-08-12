#!/usr/bin/env python3
"""Build data/commercials.js — the pool of ads that fills slot padding.

Same pointer-not-payload approach as build-catalog.py: we store archive.org
file names and runtimes, never the video itself. Each source item's metadata
is fetched once and cached for the whole session (by the player's per-item
metadata cache), so pulling from more than one source item just means one
extra fetch each, not one per spot.

Re-run manually to pick up new spots, or pass one or more item IDs to pull
from a different set of sources entirely:
    python tools/build-commercials.py [ITEM_ID ...]
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

DEFAULT_ITEMS = [
    "Collectionof90sCommercials",
    "youtube-collection-1990s-infomercial-hell",
    "westwood-promotions-pure-moods-commercial",
    "PhilipsCDIInfomercial",
    "SonyPlayStationAdvert",
    "Sony_Playstation_commercial_1997",
    "Sony_-_Playstation_commercial_1996",
    "Super_Nintendo_commercial_1992",
    "kirby-super-star-for-super-nintendo-commercial-1996",
    "Nintendo_-_Super_Scope_commercial_USA_1993",
    "Nintendo_-_Super_Game_Boy_commercial_USA_1994",
    "Nintendo_-_Super_Mario_Kart_commercial_USA_1993",
    "Nintendo_-_A_Link_to_the_Past_commercial_USA_1992",
    "1993-sega-genesis-commercial-blast-processing",
    "toe-jam-earl-in-panic-on-funkotron-sega-com-1993-vhs-d.-d.-teoli-jr.-a.-c.",
    "youtube-pfVbN4ddkkc",
    "Nintendo_64_-_Wave_Race_commercial_1997",
    "Nintendo_-_Super_Mario_64_commercial_USA_1996",
    "Nintendo_64_-_Goldeneye_007_commercial_1998",
    "george-foreman-grill-tv-infomercial-from-1995",
]
OUT_JS = Path(__file__).parent.parent / "data" / "commercials.js"

# Spots outside this range are almost certainly bad metadata or a whole-reel
# upload rather than a single ad. Raised from an original 180s once full-length
# infomercials (the George Foreman Grill spot runs ~12.7 minutes) got added on
# purpose, specifically to give getAdAt() something that can fill the longest
# observed slot-padding windows (some channels' dead air between shows runs
# into the tens of minutes) instead of falling back to the STAND BY card for
# lack of anything long enough to fit.
MIN_SEC = 5
MAX_SEC = 1800

# This is a nostalgia cable-box sim, not an adult one — a handful of source
# items include phone-sex-line and other adult-service spots mixed in among
# the ordinary vintage commercials. Excluded by exact filename since the
# source collections are small enough to hand-curate precisely, rather than
# risk a keyword filter's false positives/negatives.
EXCLUDE_TITLES = {
    "1990's INFOMERCIAL HELL #14- Phone Sex - -The Girls of Odyssey want to party with you-.mp4",
    "1990's INFOMERCIAL HELL #16- Late Night Sex Phone Line 1-800-431-GIRL.mp4",
    "1990's Infomercial Hell #24- Playboy Christmas Subscription Deal - presented by the Playboy Bunnies!.mp4",
}


def spots_for_item(item):
    with urllib.request.urlopen(f"https://archive.org/metadata/{item}", timeout=30) as r:
        meta = json.load(r)

    # Some items carry both an original upload and archive.org's own
    # auto-transcoded "<name>.ia.mp4" derivative alongside it — same content,
    # same runtime, two files. Keeping both would just double that spot's
    # odds of being picked for no real variety, so once a base name shows up
    # under both, only the plain (non-.ia) name survives.
    candidates = {}
    for f in meta.get("files", []):
        name = f.get("name", "")
        if not name.lower().endswith(".mp4"):
            continue
        base_name = name[:-len(".ia.mp4")] + ".mp4" if name.lower().endswith(".ia.mp4") else name
        if base_name in EXCLUDE_TITLES:
            continue
        try:
            duration = float(f.get("length", 0))
        except (TypeError, ValueError):
            duration = 0
        base = name[:-len(".ia.mp4")] if name.lower().endswith(".ia.mp4") else name[:-len(".mp4")]
        is_ia = name.lower().endswith(".ia.mp4")
        existing = candidates.get(base)
        if existing is None or (existing["is_ia"] and not is_ia):
            candidates[base] = {"name": name, "duration": duration, "is_ia": is_ia}

    spots = []
    skipped = 0
    for c in candidates.values():
        if not MIN_SEC <= c["duration"] <= MAX_SEC:
            skipped += 1
            continue
        spots.append({
            "key": f"ad:{item}:{c['name']}",
            "itemId": item,
            "fileHint": c["name"],
            "durationSec": round(c["duration"], 2),
        })
    return spots, skipped


def main():
    items = sys.argv[1:] if len(sys.argv) > 1 else DEFAULT_ITEMS

    all_spots = []
    total_skipped = 0
    failed = []
    for item in items:
        try:
            spots, skipped = spots_for_item(item)
        except Exception as e:
            print(f"  {item}: FAILED ({e}) -- skipping this item, re-run later to retry it")
            failed.append(item)
            continue
        total_skipped += skipped
        all_spots.extend(spots)
        print(f"  {item}: {len(spots)} spots, {skipped} skipped as out-of-range/duplicate")

    all_spots.sort(key=lambda s: (s["itemId"], s["fileHint"]))  # stable input order; the scheduler shuffles
    succeeded = [i for i in items if i not in failed]
    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sourceItems": succeeded,
        "spots": all_spots,
    }
    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    # .js not .json for the same reason catalog.js exists — file:// pages can't
    # fetch() a local file, so the app loads it as a plain <script src>.
    OUT_JS.write_text(f"window.COMMERCIALS = {json.dumps(payload, indent=1)};\n")
    total = sum(s["durationSec"] for s in all_spots)
    print(f"wrote {OUT_JS} — {len(all_spots)} spots from {len(succeeded)}/{len(items)} item(s), "
          f"{total / 60:.1f} min total, {total_skipped} skipped")
    if failed:
        print(f"failed to fetch (re-run to retry): {', '.join(failed)}")


if __name__ == "__main__":
    main()
