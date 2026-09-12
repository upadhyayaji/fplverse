export function fixtureInfoForTeam(fixtures, teamsById, teamId, gameweek) {
  const matches = (fixtures || []).filter(
    (fixture) => fixture.event === gameweek && (fixture.team_h === teamId || fixture.team_a === teamId)
  );

  if (!matches.length) return { label: "Blank", difficulty: 3, blank: true };

  const items = matches.map((fixture) => {
    const home = fixture.team_h === teamId;
    const opponent = teamsById.get(home ? fixture.team_a : fixture.team_h)?.short_name || "TBC";
    return {
      label: `${opponent} (${home ? "H" : "A"})`,
      difficulty: Number(home ? fixture.team_h_difficulty : fixture.team_a_difficulty) || 3,
    };
  });

  return {
    label: items.map((item) => item.label).join(" + "),
    difficulty: Math.max(1, Math.min(5, Math.round(items.reduce((sum, item) => sum + item.difficulty, 0) / items.length))),
    blank: false,
  };
}

export function rankPlayersForWeeks(players, selectedPositions, gameweeks, predictionFor) {
  return (players || [])
    .filter((player) => selectedPositions.has(player.element_type))
    .map((player) => ({
      player,
      total: gameweeks.reduce((sum, gameweek) => sum + predictionFor(player, gameweek), 0),
    }))
    .sort((a, b) => b.total - a.total || Number(b.player.total_points || 0) - Number(a.player.total_points || 0));
}
