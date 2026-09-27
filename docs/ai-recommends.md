# AI Recommends V1

Unpaid review release; no billing, accounts, paywall or entitlement enforcement. The engine is a pure module behind a Web Worker boundary. A paid release needs authenticated server-side recommendation requests, entitlement checks and billing webhooks; hiding client buttons would not secure this public static implementation. No external LLM is called and no squad is sent to an AI provider.

## Inputs and scoring

- Load the public deadline squad (or sample demo), or a complete same-source-GW browser Planner draft.
- Confirm bank, free transfers still available and each selling price. Public data does not reveal pre-deadline transfers/private selling prices. The user confirms already-made moves are reflected in the chosen squad. No inference of private transfer allowance.
- Default next five future GWs, horizon 1/3/5, hits off. Selected later GW uses user-supplied expected FT/bank then. All moves occur at the start; no later transfers, future prices, chips or rollover option value are simulated.
- Same shared historical prediction model; each week score the best legal XI, excluding captain doubling/autosubs. Compare with an equally optimized no-transfer XI to avoid claiming bench optimization as a transfer benefit.
- Squad composition 2/5/5/3, XI 1 GK, 3–5 DEF, 2–5 MID, 1–3 FWD; at most three per club, no duplicate players, no overspend, locked players cannot be sold. Existing illegal/incomplete drafts must be corrected first.
- Search all eligible single moves; pair search is approximate: top 8 predicted, cheapest 4 and best points/price 4 per position (union). Incoming candidates must be selectable, not removed, status a, with no declared chance below 75%. Pure forecasts are not certainty.
- Hits = 4 * max(0, transfers - confirmed remaining FT), deducted once from horizon gain and first-week gain. Free transfers are consumed even by zero-point-benefit moves; no extra value for rolling them is assumed. Hold is always included. Prefer holding/fewer moves unless the next option improves net projection by at least 2 points (explicit heuristic).
- Apply asks for confirmation, refuses stale data/deadlines or a draft changed in another tab, then saves only the browser Planner draft. It optimizes the first week's XI/C/VC using the existing optimizer. No official FPL write operations exist.
- A bank anchor preserves confirmed recommendation budget when entering Planner; subsequent manual changes retain the Planner's current-price estimate convention. Reset removes the anchor.

## Sources

https://fantasy.premierleague.com/help/rules
https://www.premierleague.com/ar/news/2174907 (official transfer guide: up to five free transfers; four-point extra-transfer cost)
https://www.premierleague.com/en/news/2858775 (selling price differs from buying price)

No unverified injuries/news are generated: explanations come from score differences and official FPL status text. Native details expose assumptions without a public accuracy panel.

## Validation

Run `node --test tests/*.test.mjs`, Python collector tests, and `python scripts/validate_site.py`. Manually test both themes/phone widths, imported vs draft vs demo, confirmation invalidation, 0/1/2+ FTs and hits, budget edits, locks, no future GWs, source/network failures, stale cross-tab draft, and applying to Planner including bank/sourceGW/selectedGW.
