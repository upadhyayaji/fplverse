# Prediction evaluation

Track FPL predictions runs hourly at minute 23, plus manual dispatch. On the first
successful run within 24 hours before a deadline it freezes that gameweek's player
forecasts. Runs after the deadline cannot backfill it. GitHub schedules are best
effort; a missed window means no evaluation for that gameweek.

Snapshots under data/predictions contain the public player inputs, historical and target fixtures,
capture time, deadline, completed-gameweek count, availability flag and SHA-256 of
both model files (filenames plus contents, v2 then v1). Older schema-1 archives
hash only predictions.mjs. The collector imports the same model as the UI. Forecasts are immutable; results may be corrected.

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


## Component model v2

Experimental, hand-specified expected-value model; not a trained ML model and not
yet proven more accurate. It replaces live forecasts after deployment and retains
the unchanged v1 model as a simultaneous frozen comparison. The Planner (including
Optimize and the selected-GW XI total) and Predictor share the same function.

Expected points are the sum of appearance, goal, assist, clean-sheet, save, bonus,
defensive-contribution and penalty-save points, less conceded-goal, card,
own-goal and missed-penalty deductions. No form/total-points blend is added to this
sum, which would double-count the scoring events.

- Minutes: mixture of a >=60-minute start, a shorter start, a cameo and no appearance.
  Start probability uses starts and completed team matches with two prior matches
  (1.5 prior starts). Start length uses season minutes/starts, capped at 90, and a
  heuristic >=60 probability. Cameos use 15 minutes and a heuristic participation
  rate. This is a rough approximation until we collect match-by-match histories.
- Availability multiplies all states. A published next-round chance is used; absent
  chance defaults to 100% for available players and 55% for flagged players. The same
  chance is held across future weeks: we do not invent injury recovery dates.
- Player rates shrink toward explicit position priors using 450 prior minutes;
  rare penalties/red cards/own goals use 1,800 prior minutes. Priors are not fitted.
  xG is blended 80/20 with actual goals; xA 70/30 with actual FPL assists. The latter
  partially accommodates differences between statistical xA and FPL assist rules.
- Opponent strength uses completed fixtures before the target GW, team scoring and
  conceding rates shrunk with six prior matches at 1.35 goals/team/match. Home/away
  factors are 1.1/0.9. If either team has no sample, use the documented v1 FDR
  factors. Team attacking strength adjusts player scoring rates; this may duplicate
  some team context already present in individual xG and must be evaluated.
- Clean sheets use a Poisson zero-goal probability over time on the pitch, only for
  >=60-minute states. GK/DEF earn four, MID one, FWD zero expected clean-sheet points.
- Saves and concessions integrate the floor(count/3) and floor(count/2) rules over
  a Poisson count distribution. Applying those floors to an expected count is wrong.
- Defensive contributions estimate the probability of reaching 10 actions for DEF
  or 12 for MID/FWD, worth two points per fixture (not per threshold multiple).
  The bootstrap defensive_contribution field is the position-relevant action count.
  Poisson variability and opponent adjustments are approximations, not calibrated.
- Bonus uses a shrunken empirical bonus rate, adjusted for exposure and attack;
  capped at three expected points conditional on appearing. It does NOT simulate
  relative BPS rankings across all players or precisely reproduce 2026/27 BPS.
- Blank GWs are zero; double GWs add separately evaluated fixtures, resetting scoring
  thresholds each match. Rounding happens at the gameweek total; no arbitrary 25 cap.

Rules references:
- https://fantasy.premierleague.com/help/rules
- https://www.premierleague.com/en/news/4361991/whats-happening-with-defensive-contribution-points-in-202627-fantasy
- https://www.premierleague.com/en/news/4679946/whats-new-in-202627-fantasy-changes-to-bonus-points-system

## Measuring improvements

Schema 2 freezes v2, its component expectations and fixture breakdowns, v1, and the
PPG baseline on identical inputs/timestamps/cohorts. Old snapshots remain untouched
and are never retroactively assigned v2 forecasts. Component actuals come from the
official per-fixture live `explain` awards, not from applying scoring thresholds to
combined double-GW statistics. If explanations are absent or do not reconcile with
total points, component actuals are null. Total-point evaluation still works.
Unknown scoring identifiers are retained as `other`; raw stats and explanations
are retained for auditing. A future new scoring rule must trigger a model revision.

The report includes same-cohort v1 MAE/RMSE/bias and component MAE/bias in downloadable
results. The Predictor exposes forecast components through “Why this score?”.

Improvement procedure (future fitting work):
1. Accumulate genuinely pre-deadline examples, including actual minutes and components.
2. Diagnose by position, playing/non-playing status, availability, and scoring component.
3. Train/tune only on earlier GWs; validate on later GWs with rolling chronological folds.
   Hold the final period out; never shuffle player-GW rows randomly across train/test.
4. Compare v2 and v1 on the same players/GWs. Inspect MAE, large errors (RMSE), bias,
   and errors among plausible starters/top captain candidates; many zero-minute
   players must not hide poor selection quality. Bootstrap uncertainty by gameweek,
   not by treating correlated players in one match as independent.
5. Accept coefficients only when improvement persists across unseen GWs and relevant
   cohorts. Then version the model and continue prospective comparisons.

No automatic retraining or coefficient updates are enabled. Recent lineups,
match-by-match minutes distributions, calibrated DC distributions and match-level
BPS simulations are future work. The current archive is the foundation for that work.
