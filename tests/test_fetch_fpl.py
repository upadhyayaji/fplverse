from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts.fetch_fpl import (
    CollectorError,
    Settings,
    discover_league_entries,
    load_settings,
    normalize_history,
    payload_changed,
)


VALID_CONFIG = {
    "enabled": False,
    "season": "2026/27",
    "league_id": None,
    "manager_ids": [123, 123, 456],
    "aliases": {"123": "Captain"},
    "publish_real_manager_names": False,
    "request_delay_seconds": 0.2,
    "allow_partial": False,
    "archive_limit": 120,
}


class FakeClient:
    def __init__(self, payloads):
        self.payloads = iter(payloads)
        self.params = []

    def get_json(self, _path, *, params=None):
        self.params.append(params)
        return next(self.payloads)


class SettingsTests(unittest.TestCase):
    def write_config(self, payload):
        directory = tempfile.TemporaryDirectory()
        path = Path(directory.name) / "config.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        self.addCleanup(directory.cleanup)
        return path

    def test_load_settings_deduplicates_ids_and_normalizes_aliases(self):
        settings = load_settings(self.write_config(VALID_CONFIG))
        self.assertEqual(settings.manager_ids, (123, 456))
        self.assertEqual(settings.aliases, {"123": "Captain"})

    def test_string_false_is_not_accepted_as_boolean(self):
        payload = {**VALID_CONFIG, "enabled": "false"}
        with self.assertRaisesRegex(CollectorError, "must be true or false"):
            load_settings(self.write_config(payload))

    def test_negative_delay_is_rejected(self):
        payload = {**VALID_CONFIG, "request_delay_seconds": -1}
        with self.assertRaisesRegex(CollectorError, "number from 0 to 10"):
            load_settings(self.write_config(payload))

    def test_boolean_is_not_accepted_as_manager_id(self):
        payload = {**VALID_CONFIG, "manager_ids": [True]}
        with self.assertRaisesRegex(CollectorError, "positive integer"):
            load_settings(self.write_config(payload))


class CollectionTests(unittest.TestCase):
    def test_league_pagination_and_deduplication(self):
        client = FakeClient(
            [
                {"standings": {"results": [{"entry": 7}, {"entry": 8}], "has_next": True}},
                {"standings": {"results": [{"entry": 8}, {"entry": 9}], "has_next": False}},
            ]
        )
        self.assertEqual(discover_league_entries(client, 42), [7, 8, 9])
        self.assertEqual(client.params, [{"page_standings": 1}, {"page_standings": 2}])

    def test_history_rejects_decreasing_cumulative_score(self):
        with self.assertRaisesRegex(CollectorError, "decrease"):
            normalize_history(
                {
                    "current": [
                        {"event": 1, "points": 50, "total_points": 50},
                        {"event": 2, "points": 10, "total_points": 40},
                    ]
                }
            )

    def test_timestamp_only_change_is_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "managers.json"
            current = {
                "season": "2026/27",
                "generated_at": "2026-01-01T00:00:00+00:00",
                "failures": [],
                "managers": [{"id": 1}],
            }
            output.write_text(json.dumps(current), encoding="utf-8")
            updated = {**current, "generated_at": "2026-01-02T00:00:00+00:00"}
            self.assertFalse(payload_changed(output, updated))


if __name__ == "__main__":
    unittest.main()

