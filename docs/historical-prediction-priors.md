# Historical inputs (components-v3-history)

No website layout changes. This is an uncalibrated candidate model, not a claim of improved accuracy.

## Official sources

- https://fantasy.premierleague.com/api/bootstrap-static/ — current players, availability, clubs and events.
- https://fantasy.premierleague.com/api/element-summary/1/ — example of official `history_past` player season totals. Collector requests each current player's endpoint and matches persistent `code` to `element_code`, never a name or old season ID.
- https://fantasy.premierleague.com/api/fixtures/ — current-season team results, home/away and fixture difficulty.
- https://www.premierleague.com/en/stats — official player and club statistics, useful for independent checks.
- https://www.premierleague.com/en/clubs/3/arsenal/stats — official club season archive. No supported bulk historical team interface was verified; this page is NOT ingested by this release.
- https://www.premierleague.com/en/news/3118332 — official explanation of xG/xA.

These public FPL endpoints are operational sources, not a guaranteed/versioned developer API. Do not infer a redistribution licence from public availability; review applicable rights before commercial reuse.

## Exact changes

Use only the previous two completed PL seasons. Weight their event totals and minutes 1.0 and 0.5. Historical per-90 prior = `(90 * weighted events + 450 * positional prior) / (weighted minutes + 450)`. Current rates use the existing 450-minute prior exposure (1800 for rare cards/penalties), so current data increasingly dominates. Missing history falls back exactly to v2; missing fields are not zero. Returning players with no recent PL seasons retain positional priors.

History informs xG/goals, xA/assists, saves, cards, own goals and penalties. Do not blend historical total FPL points, bonus or defensive-contribution awards across scoring-rule changes. Existing minutes/starts and availability logic remains current-season based: last year's minutes do not guarantee this year's starting role. Player history follows a transfer, but role/league/manager changes are not explicitly modelled yet.

Team environment remains current-season completed match goals for/against, smoothed over six pseudo-matches at 1.35 goals, with home/away adjustments and FDR fallback. Current detailed FPL attack/defence ratings were zero during inspection and are NOT used. Historical player totals cannot safely reconstruct team totals because of transfers and incomplete squads. Promoted teams use the existing conservative fallback.

## Collection and honest evaluation

`node scripts/collect-player-history.mjs` collects with four workers, bounded retries/timeouts and all-or-nothing replacement. A weekly/manual workflow refreshes `data/player-history.json`; failures preserve the previous file. Browser and audit attach the same archive; future-dated and wrong-season archives are rejected. Newly added players fall back until the next refresh. No requests per player are made from visitors' browsers.

Future frozen snapshots retain the exact historical inputs and source capture timestamp alongside current inputs/fixtures, model hash, v3, v2 and v1 forecasts. Existing snapshots are never rewritten. Compare v3 vs v2 MAE/RMSE/bias on the same future cohorts (all players and those who appeared). Keep forecasts prospective: current bootstrap/history must never be used to claim an honest old-gameweek backtest. Weights are hand-set hypotheses to tune only on earlier training periods and assess on held-out future weeks.
