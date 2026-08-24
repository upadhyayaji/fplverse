import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  datasetToCsv,
  standardDeviation,
  summarizeDataset,
  validateDataset,
} from "../assets/analytics.mjs";

const payload = JSON.parse(
  await readFile(new URL("../data/managers.json", import.meta.url), "utf8")
);

assert.equal(validateDataset(payload), payload);
const summary = summarizeDataset(payload);
assert.equal(summary.leader.name, "Archive Manager 01");
assert.equal(summary.leader.total, 2582);
assert.equal(summary.winningGap, 38);
assert.equal(summary.gameweek, 38);
assert.equal(standardDeviation([5, 5, 5]), 0);

const csv = datasetToCsv(payload);
assert.match(csv, /^manager_id,manager,team,gameweek/);
assert.match(csv, /3027768,Archive Manager 01,2025\/26 archive entry #1,38,76,2582/);

const duplicate = structuredClone(payload);
duplicate.managers[1].id = duplicate.managers[0].id;
assert.throws(() => validateDataset(duplicate), /appears more than once/);

const negativeWeek = structuredClone(payload);
negativeWeek.managers[0].history[1].total_points = negativeWeek.managers[0].history[0].total_points - 1;
assert.equal(validateDataset(negativeWeek), negativeWeek);

console.log("Frontend analytics tests passed.");
