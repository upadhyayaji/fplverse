#!/usr/bin/env python3
"""Collect current-season Fantasy Premier League manager history for FPLVerse."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
import time
from typing import Any, Callable

import requests


BASE_URL = "https://fantasy.premierleague.com/api"
DEFAULT_CONFIG = Path("config/fplverse.json")
DEFAULT_OUTPUT = Path("data/managers.json")
MAX_ENTRY_ID = 100_000_000
SEASON_PATTERN = re.compile(r"^\d{4}/\d{2}$")


class CollectorError(RuntimeError):
    """Raised for a safe, user-actionable collection failure."""


@dataclass(frozen=True)
class Settings:
    enabled: bool
    season: str
    league_id: int | None
    manager_ids: tuple[int, ...]
    aliases: dict[str, str]
    publish_real_manager_names: bool
    request_delay_seconds: float
    allow_partial: bool
    archive_limit: int


def _require_bool(raw: dict[str, Any], key: str, default: bool) -> bool:
    value = raw.get(key, default)
    if type(value) is not bool:
        raise CollectorError(f'"{key}" must be true or false.')
    return value


def _require_id(value: Any, label: str) -> int:
    if type(value) is not int or not 0 < value <= MAX_ENTRY_ID:
        raise CollectorError(f'"{label}" must be a positive integer.')
    return value


def load_settings(path: Path) -> Settings:
    if not path.exists():
        raise CollectorError(f"Configuration file not found: {path}")

    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise CollectorError("Configuration must be a JSON object.")

    season = raw.get("season")
    if not isinstance(season, str) or not SEASON_PATTERN.fullmatch(season):
        raise CollectorError('"season" must use the format YYYY/YY.')

    league_value = raw.get("league_id")
    league_id = None if league_value is None else _require_id(league_value, "league_id")

    manager_values = raw.get("manager_ids", [])
    if not isinstance(manager_values, list):
        raise CollectorError('"manager_ids" must be a JSON array.')
    manager_ids = tuple(dict.fromkeys(_require_id(value, "manager_ids item") for value in manager_values))

    aliases_value = raw.get("aliases", {})
    if not isinstance(aliases_value, dict):
        raise CollectorError('"aliases" must be a JSON object.')
    aliases: dict[str, str] = {}
    for key, value in aliases_value.items():
        entry_id = _require_id(int(key) if str(key).isdigit() else key, "alias key")
        if not isinstance(value, str) or not value.strip():
            raise CollectorError(f'Alias for entry {entry_id} must be a non-empty string.')
        aliases[str(entry_id)] = value.strip()

    delay_value = raw.get("request_delay_seconds", 0.25)
    if type(delay_value) not in (int, float) or not 0 <= delay_value <= 10:
        raise CollectorError('"request_delay_seconds" must be a number from 0 to 10.')

    archive_limit_value = raw.get("archive_limit", 120)
    if type(archive_limit_value) is not int or not 0 <= archive_limit_value <= 3650:
        raise CollectorError('"archive_limit" must be an integer from 0 to 3650.')

    return Settings(
        enabled=_require_bool(raw, "enabled", False),
        season=season,
        league_id=league_id,
        manager_ids=manager_ids,
        aliases=aliases,
        publish_real_manager_names=_require_bool(raw, "publish_real_manager_names", False),
        request_delay_seconds=float(delay_value),
        allow_partial=_require_bool(raw, "allow_partial", False),
        archive_limit=archive_limit_value,
    )


class FPLClient:
    def __init__(
        self,
        delay_seconds: float,
        *,
        session: requests.Session | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.delay_seconds = delay_seconds
        self.session = session or requests.Session()
        self.sleep = sleep
        self.session.headers.update(
            {
                "Accept": "application/json",
                "User-Agent": "FPLVerse/1.0 (+https://github.com/upadhyayaji/fplverse)",
            }
        )

    def get_json(
        self,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        attempts: int = 4,
    ) -> dict[str, Any]:
        url = f"{BASE_URL}/{path.lstrip('/')}"
        last_error: Exception | None = None

        for attempt in range(1, attempts + 1):
            try:
                response = self.session.get(url, params=params, timeout=(5, 30))
                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After", "1")
                    try:
                        wait = min(max(float(retry_after), 0), 30)
                    except ValueError:
                        wait = 1
                    if attempt < attempts:
                        self.sleep(wait)
                        continue
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, dict):
                    raise CollectorError(f"Unexpected response shape from {path}.")
                if self.delay_seconds:
                    self.sleep(self.delay_seconds)
                return payload
            except (requests.RequestException, ValueError, CollectorError) as exc:
                last_error = exc
                if attempt < attempts:
                    self.sleep(min(2 ** (attempt - 1), 8))

        raise CollectorError(f"Could not retrieve {path}: {last_error}")


def discover_league_entries(client: FPLClient, league_id: int) -> list[int]:
    entries: list[int] = []
    page = 1

    while True:
        payload = client.get_json(
            f"leagues-classic/{league_id}/standings/",
            params={"page_standings": page},
        )
        standings = payload.get("standings")
        if not isinstance(standings, dict):
            raise CollectorError("League response is missing standings.")
        results = standings.get("results")
        if not isinstance(results, list):
            raise CollectorError("League response has invalid standings results.")

        for row in results:
            if not isinstance(row, dict) or "entry" not in row:
                raise CollectorError("League response contains an invalid manager row.")
            entries.append(_require_id(row["entry"], "league entry"))

        has_next = standings.get("has_next")
        if type(has_next) is not bool:
            raise CollectorError("League response is missing a valid has_next flag.")
        if not has_next:
            break
        page += 1
        if page > 1000:
            raise CollectorError("League pagination exceeded the safety limit.")

    if not entries:
        raise CollectorError(
            f"No managers were found in classic league {league_id}. "
            "Check that it is a classic mini-league ID."
        )
    return list(dict.fromkeys(entries))


def manager_display_name(entry_id: int, profile: dict[str, Any], settings: Settings) -> str:
    if alias := settings.aliases.get(str(entry_id)):
        return alias
    if not settings.publish_real_manager_names:
        return f"Manager {entry_id}"
    parts = (
        str(profile.get("player_first_name") or "").strip(),
        str(profile.get("player_last_name") or "").strip(),
    )
    return " ".join(part for part in parts if part) or f"Manager {entry_id}"


def _integer(row: dict[str, Any], key: str, *, minimum: int = 0) -> int:
    value = row.get(key, 0)
    if type(value) is not int or value < minimum:
        raise CollectorError(f'History field "{key}" must be an integer of at least {minimum}.')
    return value


def normalize_history(history_payload: dict[str, Any]) -> list[dict[str, int]]:
    rows = history_payload.get("current")
    if not isinstance(rows, list):
        raise CollectorError("Manager history response is missing the current-season array.")

    normalized: list[dict[str, int]] = []
    seen_gameweeks: set[int] = set()
    last_total = -1

    for row in rows:
        if not isinstance(row, dict):
            raise CollectorError("Manager history contains an invalid row.")
        event = _integer(row, "event", minimum=1)
        if event > 38 or event in seen_gameweeks:
            raise CollectorError(f"Manager history contains an invalid gameweek: {event}.")
        total_points = _integer(row, "total_points")
        if total_points < last_total:
            raise CollectorError("Manager cumulative points decrease between gameweeks.")
        seen_gameweeks.add(event)
        last_total = total_points
        normalized.append(
            {
                "gameweek": event,
                "points": _integer(row, "points"),
                "total_points": total_points,
                "overall_rank": _integer(row, "overall_rank"),
                "gameweek_rank": _integer(row, "rank"),
                "transfers": _integer(row, "event_transfers"),
                "transfer_cost": _integer(row, "event_transfers_cost"),
                "points_on_bench": _integer(row, "points_on_bench"),
                "team_value": _integer(row, "value"),
                "bank": _integer(row, "bank"),
            }
        )

    normalized.sort(key=lambda item: item["gameweek"])
    return normalized


def collect_manager(client: FPLClient, entry_id: int, settings: Settings) -> dict[str, Any]:
    profile = client.get_json(f"entry/{entry_id}/")
    if type(profile.get("id")) is int and profile["id"] != entry_id:
        raise CollectorError(f"Entry profile ID did not match requested entry {entry_id}.")
    history = normalize_history(client.get_json(f"entry/{entry_id}/history/"))
    if not history:
        raise CollectorError(
            f"Entry {entry_id} returned no current-season gameweek history. "
            "The season may not have started, may have rolled over, or the entry ID may be wrong."
        )

    team_name = profile.get("name")
    return {
        "id": entry_id,
        "name": manager_display_name(entry_id, profile, settings),
        "team_name": team_name.strip() if isinstance(team_name, str) and team_name.strip() else f"Entry {entry_id}",
        "joined_time": profile.get("joined_time"),
        "started_event": profile.get("started_event"),
        "current_event": profile.get("current_event"),
        "history": history,
    }


def validate_payload(payload: dict[str, Any]) -> None:
    if not isinstance(payload.get("season"), str):
        raise CollectorError("Generated data is missing a season.")
    managers = payload.get("managers")
    if not isinstance(managers, list) or not managers:
        raise CollectorError("Generated data must contain at least one manager.")

    ids: set[int] = set()
    for manager in managers:
        if not isinstance(manager, dict):
            raise CollectorError("Generated data contains an invalid manager.")
        entry_id = _require_id(manager.get("id"), "generated manager ID")
        if entry_id in ids:
            raise CollectorError(f"Generated data contains duplicate entry ID {entry_id}.")
        ids.add(entry_id)
        if not isinstance(manager.get("name"), str) or not manager["name"].strip():
            raise CollectorError(f"Generated manager {entry_id} has no display name.")
        history = manager.get("history")
        if not isinstance(history, list) or not history:
            raise CollectorError(f"Generated manager {entry_id} has no history.")

    if payload.get("manager_count") != len(managers):
        raise CollectorError("Generated manager_count does not match the manager array.")


def write_payload(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def meaningful_snapshot(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in payload.items()
        if key not in {"generated_at", "failures"}
    }


def payload_changed(output_path: Path, payload: dict[str, Any]) -> bool:
    if not output_path.exists():
        return True
    try:
        current = json.loads(output_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return True
    return meaningful_snapshot(current) != meaningful_snapshot(payload)


def archive_payload(output_path: Path, payload: dict[str, Any], limit: int) -> Path | None:
    if limit == 0:
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    archive_dir = output_path.parent / "archive"
    archive_path = archive_dir / f"{stamp}.json"
    write_payload(archive_path, payload)
    archives = sorted(archive_dir.glob("*.json"), reverse=True)
    for expired in archives[limit:]:
        expired.unlink()
    return archive_path


def resolve_entry_ids(client: FPLClient, settings: Settings) -> list[int]:
    entries = list(settings.manager_ids)
    if settings.league_id is not None:
        entries.extend(discover_league_entries(client, settings.league_id))
    return list(dict.fromkeys(entries))


def run(config_path: Path, output_path: Path, force: bool) -> int:
    settings = load_settings(config_path)
    if not settings.enabled and not force:
        print(
            "FPLVerse collection is disabled. Add a league_id or manager_ids, "
            'then set "enabled" to true.'
        )
        return 0

    client = FPLClient(settings.request_delay_seconds)
    entry_ids = resolve_entry_ids(client, settings)
    if not entry_ids:
        raise CollectorError(
            "No managers are configured. Add league_id and/or manager_ids "
            "to config/fplverse.json."
        )

    managers: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    print(f"Collecting {len(entry_ids)} manager(s)…")

    for position, entry_id in enumerate(entry_ids, start=1):
        print(f"[{position}/{len(entry_ids)}] Entry {entry_id}")
        try:
            managers.append(collect_manager(client, entry_id, settings))
        except CollectorError as exc:
            failures.append({"entry_id": entry_id, "error": str(exc)})
            print(f"Warning: {exc}", file=sys.stderr)

    if not managers:
        raise CollectorError("No manager history could be collected.")
    if failures and not settings.allow_partial:
        raise CollectorError(
            f"{len(failures)} manager(s) failed. The last known-good data was preserved. "
            'Set "allow_partial" to true only if a partial league is acceptable.'
        )

    managers.sort(key=lambda manager: manager["history"][-1]["total_points"], reverse=True)
    payload = {
        "season": settings.season,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Fantasy Premier League public JSON responses",
        "league_id": settings.league_id,
        "manager_count": len(managers),
        "failures": failures,
        "managers": managers,
    }
    validate_payload(payload)

    if not payload_changed(output_path, payload):
        print("No meaningful FPL data changes detected.")
        return 0

    write_payload(output_path, payload)
    archive_path = archive_payload(output_path, payload, settings.archive_limit)
    print(f"Wrote {output_path}")
    if archive_path:
        print(f"Archived snapshot at {archive_path}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Run even when the configuration has enabled=false.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        return run(args.config, args.output, args.force)
    except (CollectorError, json.JSONDecodeError, OSError) as exc:
        print(f"FPLVerse collector failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
