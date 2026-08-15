#!/usr/bin/env python3
"""Find catalog episodes that can't play, by asking archive.org about every
item the catalog points at.

    python3 tools/check-items.py            # whole catalog
    python3 tools/check-items.py Simpsons   # just these show ids

One /metadata/<id> request per distinct item (1000-odd of them, not one per
episode), then the *file* each episode names is resolved out of that same
response with the same rules player.js's resolveEpisodeUrl uses -- so a file
an uploader renamed or replaced is caught here rather than as a failover in
front of a viewer.

Four ways an episode is dead, all visible in metadata:

    GONE    /metadata/<id> answers {} or {"error": ...} -- withdrawn.
    DARK    is_dark -- the item exists but its files are pulled.
    GATED   access-restricted-item, or a "loggedin" collection: metadata
            lists every file, and every one of them 401s anonymously.
    NOFILE  the item is fine, but nothing in it resolves for this episode's
            fileHint (renamed, or the derivative it needed is gone).

Whole items that come back GONE/DARK/GATED belong in build-catalog.py's
DEAD_ITEMS, which is what actually keeps them out of the catalog on the next
rebuild. NOFILE is per-episode: usually the upstream VaultVision data.js
needs its filename fixed, not the item dropped.
"""
import json
import re
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

CATALOG = Path(__file__).parent.parent / "data" / "catalog.json"
WORKERS = 12

VIDEO_EXT = re.compile(r"\.(mp4|webm|ogv)$", re.I)
MP4 = re.compile(r"\.mp4$", re.I)


def metadata(item_id):
    """archive.org's metadata for one item, or {} when it has none at all."""
    url = f"https://archive.org/metadata/{item_id}"
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=45) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            if attempt == 2:
                return {"error": f"request failed: {e}"}
    return {}


def item_status(meta):
    """None when the item itself is fine, else why it isn't."""
    if not meta or meta.get("error"):
        return "GONE"
    if meta.get("is_dark"):
        return "DARK"
    m = meta.get("metadata") or {}
    collections = m.get("collection") or []
    if isinstance(collections, str):
        collections = [collections]
    if str(m.get("access-restricted-item", "")).lower() == "true" or "loggedin" in collections:
        return "GATED"
    return None


def resolve(files, file_hint):
    """The file player.js would play, or None. Mirrors resolveEpisodeUrl():
    a derivative .mp4 made *from* the hinted file wins over the file itself
    (the original can carry AC3/DTS audio no browser decodes), then the
    same-stem .mp4 for a hint naming a non-web format, then the hint itself.
    No hint at all -> first .mp4, else first .ogv/.webm."""
    if file_hint:
        derivative = next((f for f in files
                           if f.get("original") == file_hint and MP4.search(f.get("name", ""))), None)
        if derivative:
            return derivative
        if not VIDEO_EXT.search(file_hint):
            stem = re.sub(r"\.[^./]+$", ".mp4", file_hint)
            same_stem = next((f for f in files if f.get("name") == stem), None)
            if same_stem:
                return same_stem
        return next((f for f in files if f.get("name") == file_hint), None)
    return (next((f for f in files if MP4.search(f.get("name", ""))), None) or
            next((f for f in files if re.search(r"\.(ogv|webm)$", f.get("name", ""), re.I)), None))


def main():
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    shows = catalog["shows"]
    wanted = set(sys.argv[1:])
    if wanted:
        missing = wanted - set(shows)
        if missing:
            raise SystemExit(f"no such show id(s): {', '.join(sorted(missing))}")
        shows = {k: v for k, v in shows.items() if k in wanted}

    episodes = [(show, ep) for show in shows.values() for ep in show["episodes"]]
    items = sorted({ep["itemId"] for _, ep in episodes})
    print(f"{len(shows)} shows, {len(episodes)} episodes, {len(items)} distinct items")

    metas = {}
    with ThreadPoolExecutor(WORKERS) as pool:
        for i, (item_id, meta) in enumerate(zip(items, pool.map(metadata, items)), 1):
            metas[item_id] = meta
            if i % 100 == 0:
                print(f"  ...{i}/{len(items)}")

    # show id -> reason -> [(episode title, item id)]
    broken = defaultdict(lambda: defaultdict(list))
    dead_items = {}
    for show, ep in episodes:
        meta = metas[ep["itemId"]]
        reason = item_status(meta)
        if reason:
            dead_items[ep["itemId"]] = reason
        elif not resolve(meta.get("files") or [], ep["fileHint"]):
            reason = "NOFILE"
        if reason:
            broken[show["id"]][reason].append((ep["title"], ep["itemId"]))

    total = sum(len(v) for r in broken.values() for v in r.values())
    for show_id in sorted(broken):
        show = shows[show_id]
        counts = broken[show_id]
        n = sum(len(v) for v in counts.values())
        gone = " -- WHOLE SHOW" if n == len(show["episodes"]) else ""
        print(f"\n{show['title']} ({show_id}): {n}/{len(show['episodes'])} episodes{gone}")
        for reason, eps in sorted(counts.items()):
            print(f"  {reason} x{len(eps)}")
            for title, item_id in eps[:6]:
                print(f"    {item_id}  {title}")
            if len(eps) > 6:
                print(f"    ...and {len(eps) - 6} more")

    if dead_items:
        print("\nitems for build-catalog.py's DEAD_ITEMS:")
        for item_id, reason in sorted(dead_items.items()):
            print(f'    "{item_id}",  # {reason}')

    print(f"\n{total} broken episode(s) across {len(broken)} show(s), "
          f"{len(dead_items)} dead item(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
