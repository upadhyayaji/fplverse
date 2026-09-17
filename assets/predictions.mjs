// Transparent component model; coefficients are priors, not fitted parameters.
export const modelVersion = "components-v2";
export const COMPONENTS = Object.freeze(["appearance", "goals", "assists", "cleanSheets", "saves", "bonus", "defensiveContributions", "goalsConceded", "yellowCards", "redCards", "ownGoals", "penaltiesMissed", "penaltiesSaved"]);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const num = (x, fallback = 0) => x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) ? fallback : Number(x);
const present = x => x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x));
const zero = () => Object.fromEntries(COMPONENTS.map(k => [k, 0]));
const goalPoints = {1:10, 2:6, 3:5, 4:4};
const csPoints = {1:4, 2:4, 3:1, 4:0};
const priors = {
  1:{goals:.002, assists:.015, dc:0, saves:3, bonus:.3},
  2:{goals:.055, assists:.07, dc:8, saves:0, bonus:.3},
  3:{goals:.20, assists:.16, dc:6, saves:0, bonus:.4},
  4:{goals:.38, assists:.12, dc:3, saves:0, bonus:.5},
};

// Evaluate the nonlinear scoring rule over a count distribution, not at its mean.
export function poissonExpectation(lambda, score) {
  lambda = clamp(num(lambda), 0, 60);
  let mass = Math.exp(-lambda), result = mass * score(0);
  for (let k = 1; k <= 180; k++) {
    mass *= lambda / k;
    result += mass * score(k);
  }
  return result;
}
function rate(player, field, prior, priorMinutes = 450) {
  if (!present(player[field])) return prior;
  return (Math.max(0, num(player[field])) + prior * priorMinutes / 90) /
    ((Math.max(0, num(player.minutes)) + priorMinutes) / 90);
}
function blendedRate(player, expected, actual, prior, weight) {
  return present(player[expected])
    ? weight * rate(player, expected, prior) + (1-weight) * rate(player, actual, prior)
    : rate(player, actual, prior);
}
const contextCache = new WeakMap();
function context(fixtures, gameweek) {
  let weeks = contextCache.get(fixtures);
  if (!weeks) { weeks = new Map(); contextCache.set(fixtures, weeks); }
  if (weeks.has(gameweek)) return weeks.get(gameweek);
  const teams = new Map();
  for (const f of fixtures) {
    if (!f.finished || !(f.event < gameweek) || !present(f.team_h_score) || !present(f.team_a_score)) continue;
    for (const [team, gf, ga] of [[f.team_h,f.team_h_score,f.team_a_score],[f.team_a,f.team_a_score,f.team_h_score]]) {
      const t = teams.get(team) || {games:0, goals:0, conceded:0};
      t.games++; t.goals += num(gf); t.conceded += num(ga); teams.set(team,t);
    }
  }
  weeks.set(gameweek, teams); return teams;
}
function matchEnvironment(fixture, team, teams) {
  const home = fixture.team_h === team;
  const own = teams.get(team), opp = teams.get(home ? fixture.team_a : fixture.team_h);
  const smooth = (t,key) => ((t?.[key] || 0) + 6*1.35) / ((t?.games || 0)+6);
  if (own && opp) {
    return {
      attack:clamp(smooth(own,"goals") * smooth(opp,"conceded") / 1.35 * (home?1.1:.9),.2,4),
      conceded:clamp(smooth(own,"conceded") * smooth(opp,"goals") / 1.35 * (home?.9:1.1),.2,4),
      source:"smoothed team goals",
    };
  }
  const fdr = clamp(num(home ? fixture.team_h_difficulty : fixture.team_a_difficulty,3),1,5);
  const factor = {1:1.28,2:1.14,3:1,4:.86,5:.72}[fdr] * (home?1.04:.97);
  return {attack:1.35*factor,conceded:1.35/factor,source:"fixture difficulty fallback"};
}
function minutesStates(player, games) {
  const starts = Math.max(0,num(player.starts)), minutes = Math.max(0,num(player.minutes));
  const opportunities = Math.max(games, starts, minutes/90);
  const start = clamp((starts+1.5)/(opportunities+2),0,1);
  const meanStartMinutes = starts ? clamp(minutes/starts,45,90) : 75;
  const long = clamp((meanStartMinutes-45)/30,0,1);
  const cameo = (1-start) * (minutes > 0 ? .35 : .15);
  return [{probability:start*long,minutes:clamp(meanStartMinutes,60,90)},
    {probability:start*(1-long),minutes:45}, {probability:cameo,minutes:15}];
}

export function predictPlayerBreakdown({player, fixtures = [], gameweek, completedGameweeks = 0}) {
  const components = zero(), perFixture = [];
  const position = num(player?.element_type);
  if (!player || !priors[position]) return {modelVersion,total:0,components,fixtures:perFixture};
  const team = num(player.team), prior = priors[position];
  const teams = context(fixtures, gameweek);
  const games = teams.get(team)?.games ?? completedGameweeks;
  const states = minutesStates(player,games);
  const availability = present(player.chance_of_playing_next_round)
    ? clamp(num(player.chance_of_playing_next_round)/100,0,1)
    : !player.status || player.status === "a" ? 1 : .55;
  const goalRate = blendedRate(player,"expected_goals","goals_scored",prior.goals,.8);
  const assistRate = blendedRate(player,"expected_assists","assists",prior.assists,.7);
  for (const f of fixtures.filter(f => f.event === gameweek && (f.team_h === team || f.team_a === team))) {
    const c = zero(), env = matchEnvironment(f,team,teams);
    let expectedMinutes = 0;
    for (const state of states) {
      const p = state.probability * availability, exposure = state.minutes/90;
      const attack = env.attack/1.35, defence = env.conceded/1.35;
      expectedMinutes += p*state.minutes;
      c.appearance += p*(state.minutes >= 60 ? 2 : 1);
      c.goals += p*goalPoints[position]*goalRate*exposure*attack;
      c.assists += p*3*assistRate*exposure*attack;
      if (state.minutes >= 60) c.cleanSheets += p*csPoints[position]*Math.exp(-env.conceded*exposure);
      if (position === 1) {
        c.saves += p*poissonExpectation(rate(player,"saves",prior.saves)*exposure*defence,k=>Math.floor(k/3));
        c.penaltiesSaved += p*5*rate(player,"penalties_saved",.015,1800)*exposure*defence;
      }
      if (position <= 2) c.goalsConceded -= p*poissonExpectation(env.conceded*exposure,k=>Math.floor(k/2));
      if (position !== 1) c.defensiveContributions += p*2*poissonExpectation(
        rate(player,"defensive_contribution",prior.dc)*exposure*Math.sqrt(defence), k=>k >= (position===2?10:12) ? 1 : 0);
      // Empirical bonus expectation; not an exact simulation of relative match BPS ranks.
      c.bonus += p*clamp(rate(player,"bonus",prior.bonus)*exposure*Math.sqrt(attack),0,3);
      c.yellowCards -= p*rate(player,"yellow_cards",position===1?.05:.17)*exposure;
      c.redCards -= p*3*rate(player,"red_cards",.006,1800)*exposure;
      c.ownGoals -= p*2*rate(player,"own_goals",.003,1800)*exposure;
      c.penaltiesMissed -= p*2*rate(player,"penalties_missed",.005,1800)*exposure*attack;
    }
    for (const key of COMPONENTS) components[key] += c[key];
    perFixture.push({fixtureId:f.id ?? null,opponent:f.team_h===team?f.team_a:f.team_h,
      home:f.team_h===team,expectedMinutes,environment:env,components:c,total:Object.values(c).reduce((s,n)=>s+n,0)});
  }
  const rawTotal = Object.values(components).reduce((sum,n)=>sum+n,0);
  return {modelVersion,total:Math.round(rawTotal*10)/10,rawTotal,components,fixtures:perFixture};
}
export function predictPlayerPoints(options) { return predictPlayerBreakdown(options).total; }
export const predictionMethodology = "Estimated points for the selected gameweek.";
