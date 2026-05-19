#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]

TEXT_EXTENSIONS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".md",
    ".json",
    ".yml",
    ".yaml",
    ".sh",
    ".css",
    ".html",
    ".txt",
}

SKIP_PARTS = {
    ".git",
    "node_modules",
    ".next",
    "__pycache__",
    ".venv",
}
SKIP_FILES = {"scripts/check_encoding.py"}

SUSPECT_PATTERNS = [
    "à¸",
    "à¹",
    "Ã",
    "â€”",
    "âœ",
    "�",
]


def should_scan(path: Path) -> bool:
    rel = str(path.relative_to(ROOT)).replace("\\", "/")
    if rel in SKIP_FILES:
        return False
    if any(part in SKIP_PARTS for part in path.parts):
        return False
    return path.suffix.lower() in TEXT_EXTENSIONS


def main() -> int:
    bad_utf8: list[str] = []
    bad_text: list[str] = []

    for file_path in ROOT.rglob("*"):
        if not file_path.is_file() or not should_scan(file_path):
            continue
        try:
            raw = file_path.read_bytes()
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            bad_utf8.append(str(file_path.relative_to(ROOT)))
            continue

        if any(pattern in text for pattern in SUSPECT_PATTERNS):
            bad_text.append(str(file_path.relative_to(ROOT)))

    if not bad_utf8 and not bad_text:
        print("Encoding check passed.")
        return 0

    print("Encoding check failed.")
    if bad_utf8:
        print("\nFiles not valid UTF-8:")
        for path in bad_utf8:
            print(f"- {path}")
    if bad_text:
        print("\nFiles with likely mojibake patterns:")
        for path in bad_text:
            print(f"- {path}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
