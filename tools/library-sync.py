#!/usr/bin/env python3
"""The scheduled catalog rebuild (.github/workflows/library-sync.yml).

    python3 tools/library-sync.py <path to a VaultVision checkout> [--force]

Runs build-catalog.py against the checkout, so the catalog picks up whatever
VaultVision has added and leaves out whatever its library check has found dead
on archive.org (library-health.json there). Then decides whether that's news:

  * Nothing but the timestamp moved: put the files back, so a quiet day
    doesn't leave a commit.
  * The catalog shrank by more than SHRINK_LIMIT in one go: stop and fail
    without keeping the result. That's a broken upstream or a bad scan far more
    often than it's real, so a person should look (--force accepts it).
  * Otherwise: leave the rebuilt files in place and say what changed.

Prints a summary, and under GitHub Actions hands `changed` and `message` to
the next step, which does the commit. Works by hand too.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
CATALOG = ROOT / "data" / "catalog.json"
SHRINK_LIMIT = 0.10


def shape(catalog):
    return {sid: len(s["episodes"]) for sid, s in catalog["shows"].items()}


def output(**pairs):
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            for k, v in pairs.items():
                f.write(f"{k}={v}\n")


# Everything build-catalog.py writes. Kept as it was before the build so a
# result that isn't wanted can be put back exactly, uncommitted edits and all.
WRITTEN = [ROOT / "data" / n for n in ("catalog.json", "catalog.js", "removals.md")]


def snapshot():
    return {p: p.read_bytes() if p.exists() else None for p in WRITTEN}


def restore(before):
    for p, data in before.items():
        if data is None:
            p.unlink(missing_ok=True)
        else:
            p.write_bytes(data)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    if len(args) != 1:
        raise SystemExit(__doc__)

    old = json.loads(CATALOG.read_text(encoding="utf-8"))
    before = snapshot()
    subprocess.run(
        [sys.executable, str(ROOT / "tools" / "build-catalog.py"), args[0]],
        cwd=ROOT, check=True, env={**os.environ, "REQUIRE_LIBRARY_HEALTH": "1"})
    new = json.loads(CATALOG.read_text(encoding="utf-8"))

    if {**old, "generatedAt": None} == {**new, "generatedAt": None}:
        restore(before)
        print("library sync: no change")
        output(changed="false")
        return

    was, now = shape(old), shape(new)
    eps_was, eps_now = sum(was.values()), sum(now.values())
    gone = sorted(set(was) - set(now))
    added = sorted(set(now) - set(was))
    resized = sorted(s for s in set(was) & set(now) if was[s] != now[s])
    lines = [f"{len(was)} -> {len(now)} shows, {eps_was} -> {eps_now} episodes"]
    if added:
        lines.append("added: " + ", ".join(added))
    if gone:
        lines.append("removed: " + ", ".join(gone))
    if resized:
        lines.append("changed: " + ", ".join(f"{s} ({was[s]} -> {now[s]})" for s in resized))
    print("library sync:\n  " + "\n  ".join(lines))

    if eps_now < eps_was * (1 - SHRINK_LIMIT) and not force:
        restore(before)
        raise SystemExit(
            f"the catalog lost {eps_was - eps_now} of {eps_was} episodes in one rebuild, "
            f"more than {SHRINK_LIMIT:.0%}. Not kept. If it's real, run the workflow by "
            "hand with \"force\" ticked.")

    delta = eps_now - eps_was
    output(changed="true",
           message=f"Library sync: {len(now)} shows, {eps_now} episodes ({delta:+d})")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("### Library sync\n\n" + "".join(f"- {l}\n" for l in lines))


if __name__ == "__main__":
    main()
