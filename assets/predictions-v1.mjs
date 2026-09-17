const POSITION_PRIORS = Object.freeze({
  1: 3.4,
  2: 3.5,
  3: 3.8,
  4: 3.8,
});

const DIFFICULTY_FACTORS = Object.freeze({
  1: 1.28,
  2: 1.14,
  3: 1,
  4: 0.86,
  5: 0.72,
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function availabilityFactor(player, isNextGameweek) {
  const rawChance = player.chance_of_playing_next_round;
  const suppliedChance = Number(rawChance);
  let chance;
  if (rawChance !== null && rawChance !== "" && Number.isFinite(suppliedChance)) {
    chance = clamp(suppliedChance / 100, 0, 1);
  } else {
    chance = player.status === "a" || !player.status ? 1 : 0.55;
  }
  return isNextGameweek ? chance : Math.max(0.8, chance);
}

function roleFactor(player, completedGameweeks) {
  if (completedGameweeks <= 0) return 0.85;
  const minuteShare = clamp(numeric(player.minutes) / (completedGameweeks * 90), 0, 1);
  const startShare = clamp(numeric(player.starts) / completedGameweeks, 0, 1);
  return clamp(0.2 + 0.8 * (0.65 * minuteShare + 0.35 * startShare), 0.2, 1);
}

function fixtureFactor(fixture, teamId) {
  const isHome = fixture.team_h === teamId;
  const difficulty = clamp(
    numeric(isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty, 3),
    1,
    5
  );
  const venueFactor = isHome ? 1.04 : 0.97;
  return DIFFICULTY_FACTORS[difficulty] * venueFactor;
}

export function predictPlayerPoints({
  player,
  fixtures,
  gameweek,
  completedGameweeks = 0,
  isNextGameweek = false,
}) {
  const teamId = numeric(player?.team);
  const matches = (fixtures || []).filter(
    (fixture) => fixture.event === gameweek && (fixture.team_h === teamId || fixture.team_a === teamId)
  );
  if (!player || !teamId || !matches.length) return 0;

  const prior = POSITION_PRIORS[player.element_type] || 3.6;
  const form = numeric(player.form, prior);
  const pointsPerGame = numeric(player.points_per_game, prior);
  const minutes = numeric(player.minutes);
  const pointsPer90 = minutes >= 90
    ? numeric(player.total_points) / (minutes / 90)
    : pointsPerGame;
  const observedRate = 0.5 * form + 0.3 * pointsPerGame + 0.2 * pointsPer90;
  const sampleWeight = clamp(minutes / 450, 0, 1) * 0.85;
  const scoringRate = prior * (1 - sampleWeight) + observedRate * sampleWeight;
  const expectedRole = roleFactor(player, completedGameweeks);
  const availability = availabilityFactor(player, isNextGameweek);
  const fixtureTotal = matches.reduce((sum, fixture) => sum + fixtureFactor(fixture, teamId), 0);
  const projection = scoringRate * expectedRole * availability * fixtureTotal;

  return Math.round(clamp(projection, 0, 25) * 10) / 10;
}

export const predictionMethodology =
  "Blends form, points per game and points per 90, then adjusts for expected minutes, availability, venue and fixture difficulty.";
