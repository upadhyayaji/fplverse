# Prediction evaluation

Track FPL predictions runs hourly at minute 23, plus manual dispatch. On the first
successful run within 24 hours before a deadline it freezes that gameweek's player
forecasts. Runs after the deadline cannot backfill it. GitHub schedules are best
effort; a missed window means no evaluation for that gameweek.

Snapshots under data/predictions contain the public player inputs, target fixtures,
capture time, deadline, completed-gameweek count, availability flag and SHA-256 of
the exact predictions.mjs source. The collector imports the same model as the UI.
It preserves the UI's current availability semantics rather than silently changing
the model during measurement. Forecasts are immutable; results may be corrected.

Actual points come from FPL event/{gw}/live only once the bootstrap event is both
finished and data_checked. Double gameweeks use the event total. Zero minutes and
negative scores are retained. Missing actual records are null, excluded from
metrics and counted explicitly. No captain multipliers are used.

Report MAE, RMSE, signed bias and a frozen points-per-game baseline's MAE. Show all
players, players with minutes, and position breakdowns. All-player errors alone
can be misleading because non-playing players frequently score zero. Compare
models only on matched forecast cohorts and deadlines; do not mix model versions.
The summary includes per-model aggregates as well as gameweek reports.

No historical forecasts are fabricated using present-day form or injury data.
The first real accuracy result requires a captured future deadline and final results.
Unit tests are synthetic and establish code behavior, not predictive accuracy.

The Predictor page's accuracy panel is independent of live forecast filters:
it evaluates the frozen one-gameweek cohort at capture time. Today's live numbers
can differ. Raw forecast and result JSON are published with the site for auditing.
Model source is recoverable from Git history and checked using its stored hash.

The Pages workflow also runs after successful tracking jobs, because commits
made by GITHUB_TOKEN do not trigger push workflows. Hourly runs may republish
unchanged results. Both data writers share one concurrency group.

Run:

    node tests/prediction-audit.test.mjs
    node scripts/track-predictions.mjs

The second command uses the live FPL API and writes archive files. Merge the PR
to activate scheduled tracking; manually dispatch Track FPL predictions if needed.
