import assert from "node:assert/strict";
import { predictPlayerPoints } from "../assets/predictions.mjs";

const player = {
  team: 1,
  element_type: 3,
  form: "6.0",
  points_per_game: "5.5",
  total_points: 18,
  minutes: 270,
  starts: 3,
  status: "a",
  chance_of_playing_next_round: 100,
};

const fixture = (event, difficulty, home = true) => ({
  event,
  team_h: home ? 1 : 2,
  team_a: home ? 2 : 1,
  team_h_difficulty: home ? difficulty : 3,
  team_a_difficulty: home ? 3 : difficulty,
});

const predict = (fixtures, overrides = {}) => predictPlayerPoints({
  player: { ...player, ...(overrides.player || {}) },
  fixtures,
  gameweek: 4,
  completedGameweeks: 3,
  isNextGameweek: true,
});

assert.equal(predict([]), 0, "blank gameweeks should project zero points");

const easy = predict([fixture(4, 1)]);
const hard = predict([fixture(4, 5)]);
assert.ok(easy > hard, "easy fixtures should project above hard fixtures");

const doubleGameweek = predict([fixture(4, 2), fixture(4, 3, false)]);
const singleGameweek = predict([fixture(4, 2)]);
assert.ok(doubleGameweek > singleGameweek, "double gameweeks should include both fixtures");

const unavailable = predict([fixture(4, 2)], {
  player: { chance_of_playing_next_round: 0, status: "i" },
});
assert.equal(unavailable, 0, "a confirmed unavailable player should project zero for the next gameweek");

const healthyWithNoPublishedChance = predict([fixture(4, 2)], {
  player: { chance_of_playing_next_round: null, status: "a" },
});
assert.equal(healthyWithNoPublishedChance, singleGameweek, "a null chance should not penalize an available player");

const rotationPlayer = predict([fixture(4, 2)], {
  player: { minutes: 45, starts: 0 },
});
assert.ok(singleGameweek > rotationPlayer, "expected minutes should reduce rotation-player projections");

console.log("Prediction model tests passed.");
