#!/usr/bin/env python3
"""Build data/commercials.js — the pool of ads that fills slot padding.

Same pointer-not-payload approach as build-catalog.py: we store archive.org
file names and runtimes, never the video itself. One archive.org item holds
every spot, so the player's per-item metadata cache means the whole ad break
costs exactly one metadata fetch for the session.

Re-run manually to pick up new spots, or point it at a different item:
    python tools/build-commercials.py [ITEM_ID]
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

DEFAULT_ITEM = "Collectionof90sCommercials"
OUT_JS = Path(__file__).parent.parent / "data" / "commercials.js"

# Spots outside this range are almost certainly bad metadata or a whole-reel
# upload rather than a single ad — a 20-minute "commercial" would blow past
# the pad it's meant to fill.
MIN_SEC = 5
MAX_SEC = 180


def main():
    item = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ITEM
    with urllib.request.urlopen(f"https://archive.org/metadata/{item}") as r:
        meta = json.load(r)

    spots = []
    skipped = 0
    for f in meta.get("files", []):
        if not f.get("name", "").lower().endswith(".mp4"):
            continue
        try:
            duration = float(f.get("length", 0))
        except (TypeError, ValueError):
            duration = 0
        if not MIN_SEC <= duration <= MAX_SEC:
            skipped += 1
            continue
        spots.append({
            "key": f"ad:{item}:{f['name']}",
            "itemId": item,
            "fileHint": f["name"],
            "durationSec": round(duration, 2),
        })

    spots.sort(key=lambda s: s["fileHint"])  # stable input order; the scheduler shuffles
    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sourceItem": item,
        "spots": spots,
    }
    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    # .js not .json for the same reason catalog.js exists — file:// pages can't
    # fetch() a local file, so the app loads it as a plain <script src>.
    OUT_JS.write_text(f"window.COMMERCIALS = {json.dumps(payload, indent=1)};\n")
    total = sum(s["durationSec"] for s in spots)
    print(f"wrote {OUT_JS} — {len(spots)} spots, {total / 60:.1f} min total, "
          f"{skipped} skipped as out-of-range")


if __name__ == "__main__":
    main()
