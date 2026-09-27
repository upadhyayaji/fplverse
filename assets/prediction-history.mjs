// Official FPL season totals are priors, never historical backtests.
export const HISTORY_FIELDS = ["expected_goals", "goals_scored", "expected_assists", "assists", "saves", "yellow_cards", "red_cards", "own_goals", "penalties_missed", "penalties_saved"];
const valid = x => x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x)) && Number(x) >= 0;
export function seasonStart(bootstrap) {
  const date = new Date(bootstrap.events?.[0]?.deadline_time);
  return date.getUTCFullYear() - (date.getUTCMonth() < 6 ? 1 : 0);
}
export function historicalPrior(player, field, fallback) {
  const rows = player.prediction_history?.seasons || [];
  let count = 0, minutes = 0;
  for (const row of rows) {
    if (!HISTORY_FIELDS.includes(field) || !valid(row[field]) || !valid(row.minutes) || Number(row.minutes) <= 0) continue;
    const age = player.prediction_history.season - Number(row.season_name?.slice(0,4));
    if (age !== 1 && age !== 2) continue;
    const weight = age === 1 ? 1 : .5;
    count += Number(row[field]) * weight;
    minutes += Number(row.minutes) * weight;
  }
  if (!minutes) return fallback;
  // Sparse historical seasons are themselves shrunk to the positional prior.
  return (90 * count + 450 * fallback) / (minutes + 450);
}
export function attachHistory(bootstrap, archive, now = Date.now()) {
  const season = seasonStart(bootstrap);
  const captured = Date.parse(archive?.capturedAt);
  // Wrong-season/future data must not silently contaminate a forecast.
  if (archive?.schema !== 1 || archive.season !== season || !Number.isFinite(captured) || captured > now) return false;
  for (const player of bootstrap.elements || []) {
    const record = archive.players?.[String(player.code)];
    if (!record || record.code !== player.code) continue;
    player.prediction_history = {season, capturedAt:archive.capturedAt, source:archive.source,
      seasons:(record.seasons || []).filter(row => row.element_code === player.code && [1,2].includes(season-Number(row.season_name?.slice(0,4))))};
  }
  return true;
}
export async function loadHistory(bootstrap) {
  try {
    const response = await fetch(new URL("../data/player-history.json", import.meta.url), {signal:AbortSignal.timeout(8000)});
    if (!response.ok) return false;
    return attachHistory(bootstrap, await response.json());
  } catch { return false; } // Current-season model remains usable during source failure.
}
