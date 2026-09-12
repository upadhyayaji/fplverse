#!/usr/bin/env python3
"""Validate the static site entry points and its generated data."""

from __future__ import annotations

from html.parser import HTMLParser
import json
from pathlib import Path
import sys
from urllib.parse import urlparse

from fetch_fpl import CollectorError, validate_payload


ROOT = Path(__file__).resolve().parents[1]


class AssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.references: list[str] = []
        self.element_ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if element_id := values.get("id"):
            if element_id in self.element_ids:
                raise ValueError(f'Duplicate HTML id "{element_id}".')
            self.element_ids.add(element_id)
        attribute = "href" if tag == "link" else "src" if tag == "script" else None
        if attribute and values.get(attribute):
            self.references.append(values[attribute] or "")


def main() -> int:
    errors: list[str] = []
    for page_name in ("index.html", "planner.html", "predictor.html"):
        index_path = ROOT / page_name
        if not index_path.exists():
            errors.append(f"{page_name} does not exist.")
            continue
        parser = AssetParser()
        try:
            parser.feed(index_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            errors.append(str(exc))
        else:
            for reference in parser.references:
                parsed = urlparse(reference)
                if parsed.scheme or parsed.netloc:
                    continue
                asset_path = ROOT / parsed.path
                if not asset_path.is_file():
                    errors.append(f"{page_name} references missing asset: {reference}")

    data_path = ROOT / "data" / "managers.json"
    try:
        payload = json.loads(data_path.read_text(encoding="utf-8"))
        validate_payload(payload)
    except (OSError, json.JSONDecodeError, CollectorError) as exc:
        errors.append(f"Invalid data/managers.json: {exc}")

    seasons_path = ROOT / "data" / "seasons.json"
    try:
        catalog = json.loads(seasons_path.read_text(encoding="utf-8"))
        seasons = catalog.get("seasons") if isinstance(catalog, dict) else None
        if not isinstance(seasons, list) or not seasons:
            raise ValueError("Season catalog must contain at least one season.")
        for season in seasons:
            if not isinstance(season, dict) or not isinstance(season.get("path"), str):
                raise ValueError("Every season catalog item must include a path.")
            if not (ROOT / season["path"]).is_file():
                raise ValueError(f'Season catalog references missing data: {season["path"]}')
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        errors.append(f"Invalid data/seasons.json: {exc}")

    config_path = ROOT / "config" / "fplverse.json"
    try:
        json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"Invalid config/fplverse.json: {exc}")

    worker_paths = [ROOT / "worker" / "src" / "index.js", ROOT / "worker" / "wrangler.jsonc"]
    for worker_path in worker_paths:
        if not worker_path.is_file():
            errors.append(f"Missing live API file: {worker_path.relative_to(ROOT)}")

    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr)
        return 1

    print("Static site and data validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
