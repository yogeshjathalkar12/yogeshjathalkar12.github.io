#!/usr/bin/env python3
"""Sets the Raptor download links and version wording on every page from scripts/release.json.

    python scripts/set_release.py            apply
    python scripts/set_release.py --check    only report (exit 1 if any page is out of step)

Why this exists: the same links and labels sit on about 20 pages, and editing them by hand let them drift apart
(a download pointing at one version, the page text claiming another, the Mac file named after a third).
Edit scripts/release.json after publishing a release, run this, commit. It is safe to run twice.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = os.path.join(ROOT, "ventures", "raptor")
SKIP_DIRS = {"app"}  # the built web app lives here; it is not a marketing page

DOT = "·"  # the middle dot used in the page copy


def rules(cfg):
    win, mac = cfg["windows"], cfg["mac"]
    v = win["version"]
    return [
        ("Windows download link",
         # either the GitHub address (how it used to be) or the download proxy that serves it without the 37-minute link expiry
         re.compile(r"https://(?:github\.com/[\w.-]+/[\w.-]+/releases/download/[^\"'\s)<>]*|raptor-download\.[\w.-]+\.workers\.dev/)(?:Raptor-Setup-[\d.]+\.exe|windows(?![\w.-]))"),
         win["url"]),
        ("Mac download link",
         # the GitHub address (how it used to be) or the download proxy (see the Windows rule above)
         re.compile(r"https://(?:github\.com/[\w.-]+/[\w.-]+/releases/download/[^\"'\s)<>]*|raptor-download\.[\w.-]+\.workers\.dev/)(?:Raptor-[\d.]+-mac-arm64\.dmg|mac(?![\w.-]))"),
         mac["url"]),
        ("Mac file name in the text", re.compile(r"(?<![/\w])Raptor-[\d.]+-mac-arm64\.dmg"), mac["file"]),
        ("Windows button label", re.compile(r'aria-label="Download Raptor (?:v?[\d.]+ )?for Windows"'), f'aria-label="Download Raptor {v} for Windows"'),
        # The version words are live markers (see ventures/raptor/release.js): the page fills them from the download server at load time, so a release
        # needs no page edit at all. The numbers written INSIDE the markers (and in release.js) are only the fallback for a browser without scripts, a
        # search engine, or an unreachable server; this keeps them in step with release.json.
        ("Windows version marker", re.compile(r'<span data-raptor-version="windows">[\d.]+</span>'), f'<span data-raptor-version="windows">{v}</span>'),
        ("Mac version marker", re.compile(r'<span data-raptor-version="mac">[\d.]+</span>'), f'<span data-raptor-version="mac">{mac["version"]}</span>'),
        ("Fallback variable (release.js)",
         re.compile(r"window\.RAPTOR_RELEASE = \{ windows: '[\d.]+', mac: '[\d.]+', macFile: 'Raptor-[\d.]+-mac-arm64\.dmg' \};"),
         f"window.RAPTOR_RELEASE = {{ windows: '{v}', mac: '{mac['version']}', macFile: '{mac['file']}' }};"),
        # the FAQ sentence also sits in the page's structured data (JSON-LD), which cannot be filled by a script
        ("FAQ version note", re.compile(r"\((?:stable v1\.0|version [\d.]+)\)"), f"(version {v})"),
    ]


def main(check_only: bool) -> int:
    with open(os.path.join(ROOT, "scripts", "release.json"), encoding="utf-8") as f:
        cfg = json.load(f)
    all_rules = rules(cfg)
    changed_files, total = 0, 0
    for folder, dirs, files in os.walk(PAGES):
        dirs[:] = [d for d in dirs if not (folder == PAGES and d in SKIP_DIRS)]
        for name in files:
            if not (name.endswith(".html") or name in ("download.js", "release.js")):      # download.js holds the chooser's addresses, release.js the fallback version
                continue
            path = os.path.join(folder, name)
            with open(path, encoding="utf-8", newline="") as f:
                text = f.read()
            new, file_changes = text, []
            for label, pattern, replacement in all_rules:
                new, n = pattern.subn(lambda _m, r=replacement: r, new)
                # count only real changes, not matches that already say the right thing
                fixed = len(pattern.findall(text)) - len([m for m in pattern.findall(text) if m == replacement])
                if fixed:
                    file_changes.append(f"{label} x{fixed}")
            if new != text:
                changed_files += 1
                total += len(file_changes)
                print(f"{'would change' if check_only else 'updated'}: {os.path.relpath(path, ROOT)}  ({', '.join(file_changes)})")
                if not check_only:
                    with open(path, "w", encoding="utf-8", newline="") as f:
                        f.write(new)
    if changed_files == 0:
        print("every page already matches scripts/release.json")
    else:
        print(f"{changed_files} page(s) {'out of step' if check_only else 'updated'}")
    return 1 if (check_only and changed_files) else 0


if __name__ == "__main__":
    sys.exit(main("--check" in sys.argv))
