# FPLVerse

FPLVerse is a lightweight Fantasy Premier League dashboard for a friends-and-family league. It turns manager history into a cumulative title race, weekly score chart, live table, and manager-level analytics.

The repository is deliberately simple: static HTML, CSS, and JavaScript on GitHub Pages; a Python collector writes JSON; GitHub Actions validates, updates, and deploys the site.

## Features

- Cumulative and weekly-points charts
- Clickable manager comparison legend
- Current standings and points-to-leader gap
- Best gameweek, consistency, comeback, and recent-form metrics
- JSON upload for private/offline analysis
- CSV export
- Responsive and keyboard-accessible interface
- Fictional demo dataset that works without FPL credentials
- Current-season collection from a classic mini-league or explicit entry IDs
- Last-known-good protection, bounded archives, retries, and strict configuration checks

## Architecture

```text
FPL API → scripts/fetch_fpl.py → data/managers.json
                                  ↓
index.html + assets/analytics.mjs + assets/app.js → GitHub Pages
```

```text
fplverse/
├── .github/workflows/
│   ├── ci.yml
│   ├── pages.yml
│   └── update-data.yml
├── assets/
│   ├── analytics.mjs
│   ├── app.js
│   ├── favicon.svg
│   └── styles.css
├── config/fplverse.json
├── data/managers.json
├── schema/managers.schema.json
├── scripts/
│   ├── fetch_fpl.py
│   └── validate_site.py
├── tests/
├── index.html
└── requirements.txt
```

## Run locally

```bash
python -m venv .venv
python -m pip install -r requirements.txt
python scripts/validate_site.py
python -m http.server 8000
```

Open `http://localhost:8000`.

Run all tests:

```bash
python -m compileall -q scripts tests
python -m unittest discover -s tests -p "test_*.py" -v
node --check assets/analytics.mjs
node --check assets/app.js
node tests/analytics.test.mjs
```

## Configure real FPL data

Edit `config/fplverse.json`:

```json
{
  "enabled": true,
  "season": "2026/27",
  "league_id": 123456,
  "manager_ids": [],
  "aliases": {
    "987654": "Apoorv"
  },
  "publish_real_manager_names": false,
  "request_delay_seconds": 0.25,
  "allow_partial": false,
  "archive_limit": 120
}
```

- `league_id` discovers every entry in one classic mini-league.
- `manager_ids` tracks specific FPL entry IDs.
- `aliases` replaces public names with friendly labels.
- `publish_real_manager_names` should remain `false` unless every participant is comfortable with publication.
- `allow_partial: false` protects the last known-good dataset when any configured manager fails.
- `archive_limit` bounds retained snapshots; `0` disables archives.

Then run:

```bash
python scripts/fetch_fpl.py
```

The collector is disabled by default, so the repository safely deploys fictional data until configuration is intentional.

## Historical-season limitation

The standard FPL manager-history endpoint normally exposes the active season. It is not a reliable way to reconstruct a completed season after the FPL service rolls over. Preserve snapshots while the season is active or ingest historical data from a separate licensed or community source.

## GitHub Pages

The Pages workflow validates the project and publishes only:

- `index.html`
- `assets/`
- `data/managers.json`

Configuration, source scripts, tests, and archives are not included in the public Pages artifact.

In **Settings → Pages**, select **GitHub Actions** as the source. Merging a validated change into `main` triggers deployment.

## Privacy

Anyone who can view the site can inspect `data/managers.json`. Use aliases, keep real-name publication disabled, and confirm participant consent before making the site public.

FPLVerse is an independent fan project and is not affiliated with the Premier League.
