import assert from "node:assert/strict";
import { fixtureInfoForTeam, rankPlayersForWeeks } from "../assets/predictor-data.mjs";

const teams = new Map([
  [1, { short_name: "ARS" }],
  [2, { short_name: "CHE" }],
  [3, { short_name: "LIV" }],
]);

const double = fixtureInfoForTeam([
  { event: 8, team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 4 },
  { event: 8, team_h: 3, team_a: 1, team_h_difficulty: 3, team_a_difficulty: 5 },
], teams, 1, 8);

assert.equal(double.label, "CHE (H) + LIV (A)");
assert.equal(double.difficulty, 4);
assert.equal(double.blank, false);
assert.deepEqual(fixtureInfoForTeam([], teams, 1, 8), { label: "Blank", difficulty: 3, blank: true });

const players = [
  { id: 1, element_type: 2, total_points: 20 },
  { id: 2, element_type: 3, total_points: 30 },
  { id: 3, element_type: 2, total_points: 10 },
];
const values = new Map([[1, 4], [2, 9], [3, 6]]);
const ranked = rankPlayersForWeeks(players, new Set([2]), [4, 5], (player) => values.get(player.id));

assert.deepEqual(ranked.map((item) => item.player.id), [3, 1]);
assert.deepEqual(ranked.map((item) => item.total), [12, 8]);

console.log("Points predictor data tests passed.");
