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
assert.equal(summary.leader.name, "Priya");
assert.equal(summary.leader.total, 851);
assert.equal(summary.winningGap, 4);
assert.equal(summary.comeback.manager.name, "Priya");
assert.equal(summary.comeback.improvement, 4);
assert.equal(standardDeviation([5, 5, 5]), 0);

const csv = datasetToCsv(payload);
assert.match(csv, /^manager_id,manager,team,gameweek/);
assert.match(csv, /100003,Apoorv,Ctrl Alt De Ligt,12,79,842/);

const duplicate = structuredClone(payload);
duplicate.managers[1].id = duplicate.managers[0].id;
assert.throws(() => validateDataset(duplicate), /appears more than once/);

console.log("Frontend analytics tests passed.");

