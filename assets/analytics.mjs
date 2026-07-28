const REQUIRED_HISTORY_FIELDS = ["gameweek", "points", "total_points"];

export function validateDataset(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("The data file must contain one JSON object.");
  }
  if (typeof payload.season !== "string" || !payload.season.trim()) {
    throw new Error("The data file is missing a valid season.");
  }
  if (!Array.isArray(payload.managers) || payload.managers.length === 0) {
    throw new Error("The data file must contain at least one manager.");
  }

  const ids = new Set();
  payload.managers.forEach((manager, managerIndex) => {
    if (!Number.isInteger(manager.id) || manager.id <= 0) {
      throw new Error(`Manager ${managerIndex + 1} has an invalid ID.`);
    }
    if (ids.has(manager.id)) {
      throw new Error(`Manager ID ${manager.id} appears more than once.`);
    }
    ids.add(manager.id);
    if (typeof manager.name !== "string" || !manager.name.trim()) {
      throw new Error(`Manager ${manager.id} is missing a name.`);
    }
    if (!Array.isArray(manager.history) || manager.history.length === 0) {
      throw new Error(`Manager ${manager.name} has no gameweek history.`);
    }

    let lastGameweek = 0;
    let lastTotal = -1;
    manager.history.forEach((row) => {
      for (const field of REQUIRED_HISTORY_FIELDS) {
        if (!Number.isInteger(row[field])) {
          throw new Error(`${manager.name} has a non-integer ${field}.`);
        }
      }
      if (row.gameweek <= lastGameweek || row.gameweek < 1 || row.gameweek > 38) {
        throw new Error(`${manager.name} has unordered or invalid gameweeks.`);
      }
      if (row.total_points < lastTotal) {
        throw new Error(`${manager.name} has decreasing cumulative points.`);
      }
      lastGameweek = row.gameweek;
      lastTotal = row.total_points;
    });
  });

  return payload;
}

export function latestRow(manager) {
  return manager.history.at(-1);
}

export function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values) {
  if (!values.length) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

export function managerStats(manager) {
  const points = manager.history.map((row) => row.points);
  const best = manager.history.reduce((winner, row) =>
    row.points > winner.points ? row : winner
  );
  const worst = manager.history.reduce((loser, row) =>
    row.points < loser.points ? row : loser
  );
  return {
    ...manager,
    total: latestRow(manager).total_points,
    average: average(points),
    standardDeviation: standardDeviation(points),
    best,
    worst,
    finalFive: points.slice(-5).reduce((sum, value) => sum + value, 0),
  };
}

export function buildStandings(managers) {
  return managers
    .map(managerStats)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .map((manager, index) => ({ ...manager, rank: index + 1 }));
}

export function biggestComeback(managers) {
  const allGameweeks = managers.flatMap((manager) =>
    manager.history.map((row) => row.gameweek)
  );
  const finalGameweek = Math.max(...allGameweeks);
  let winner = null;

  for (const manager of managers) {
    const rankAt = (gameweek) => {
      const totals = managers
        .map((candidate) => {
          const row = candidate.history.find((history) => history.gameweek === gameweek);
          return row ? { id: candidate.id, score: row.total_points } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);
      return totals.findIndex((candidate) => candidate.id === manager.id) + 1;
    };

    const startGameweek = Math.min(...manager.history.map((row) => row.gameweek));
    const improvement = rankAt(startGameweek) - rankAt(finalGameweek);
    if (!winner || improvement > winner.improvement) {
      winner = { manager, improvement };
    }
  }
  return winner;
}

export function summarizeDataset(payload) {
  validateDataset(payload);
  const standings = buildStandings(payload.managers);
  const leader = standings[0];
  const runnerUp = standings[1];
  const bestWeek = standings.reduce((winner, manager) =>
    manager.best.points > winner.best.points ? manager : winner
  );
  const consistent = standings.reduce((winner, manager) =>
    manager.standardDeviation < winner.standardDeviation ? manager : winner
  );
  const highestAverage = standings.reduce((winner, manager) =>
    manager.average > winner.average ? manager : winner
  );
  const gameweek = Math.max(...standings.map((manager) => latestRow(manager).gameweek));

  return {
    standings,
    leader,
    winningGap: runnerUp ? leader.total - runnerUp.total : leader.total,
    leagueAverage: average(standings.map((manager) => manager.total)),
    bestWeek,
    consistent,
    comeback: biggestComeback(payload.managers),
    highestAverage,
    gameweek,
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function datasetToCsv(payload) {
  const rows = [
    [
      "manager_id",
      "manager",
      "team",
      "gameweek",
      "points",
      "total_points",
      "overall_rank",
      "transfers",
      "transfer_cost",
      "bench_points",
    ],
  ];

  for (const manager of payload.managers) {
    for (const history of manager.history) {
      rows.push([
        manager.id,
        manager.name,
        manager.team_name,
        history.gameweek,
        history.points,
        history.total_points,
        history.overall_rank ?? "",
        history.transfers ?? "",
        history.transfer_cost ?? "",
        history.points_on_bench ?? "",
      ]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

