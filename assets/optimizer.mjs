// Search every legal formation; within a position, highest forecasts dominate.
export function optimizeSquad(squad, players, predict) {
  const groups = { 1: [], 2: [], 3: [], 4: [] };
  if (squad.length !== 15 || new Set(squad.map(s => s.element)).size !== 15) {
    throw new Error("Fill all 15 squad slots before optimizing.");
  }
  for (const slot of squad) {
    const player = players.get(slot.element);
    if (!player || !groups[player.element_type]) throw new Error("Fill all 15 squad slots before optimizing.");
    const score = predict(player);
    if (!Number.isFinite(score)) throw new Error("Predictions are unavailable. Please reload the squad.");
    groups[player.element_type].push({ slot, player, score });
  }
  for (const [type, size] of [[1, 2], [2, 5], [3, 5], [4, 3]]) {
    if (groups[type].length !== size) throw new Error("The squad must contain 2 GK, 5 DEF, 5 MID and 3 FWD.");
  }
  const rank = (a, b) => b.score - a.score || a.slot.position - b.slot.position || a.player.id - b.player.id;
  Object.values(groups).forEach(group => group.sort(rank));
  let best;
  for (let defenders = 3; defenders <= 5; defenders++) {
    for (let midfielders = 2; midfielders <= 5; midfielders++) {
      const forwards = 10 - defenders - midfielders;
      if (forwards < 1 || forwards > 3) continue;
      const xi = [...groups[1].slice(0, 1), ...groups[2].slice(0, defenders),
        ...groups[3].slice(0, midfielders), ...groups[4].slice(0, forwards)];
      const total = xi.reduce((sum, item) => sum + item.score, 0);
      const retained = xi.filter(item => item.slot.position <= 11).length;
      if (!best || total > best.total + 1e-9 ||
          (Math.abs(total - best.total) < 1e-9 && retained > best.retained)) best = { xi, total, retained };
    }
  }
  const leaders = [...best.xi].sort(rank);
  const selected = new Set(best.xi.map(item => item.player.id));
  const reserveKeeper = groups[1].filter(item => !selected.has(item.player.id));
  const reserveOutfield = [...groups[2], ...groups[3], ...groups[4]]
    .filter(item => !selected.has(item.player.id)).sort(rank);
  return [...best.xi, ...reserveKeeper, ...reserveOutfield].map((item, index) => ({
    ...item.slot,
    position: index + 1,
    is_captain: item.player.id === leaders[0].player.id,
    is_vice_captain: item.player.id === leaders[1].player.id,
  }));
}
