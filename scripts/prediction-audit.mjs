import { predictPlayerBreakdown, COMPONENTS, modelVersion } from "../assets/predictions.mjs";

import { predictPlayerPoints as predictV1 } from "../assets/predictions-v1.mjs";

export function makeSnapshot(bootstrap, fixtures, capturedAt, modelHash) {
  const now = Date.parse(capturedAt);
  const event = [...bootstrap.events].sort((a,b)=>a.id-b.id)
    .find(e => Date.parse(e.deadline_time) > now);
  if (!event || Date.parse(event.deadline_time) - now > 86400000) return null;
  if (!Array.isArray(bootstrap.elements) || !bootstrap.elements.length ||
      !Array.isArray(fixtures) || !fixtures.length) throw new Error("Empty FPL source data");
  const completed = bootstrap.events.filter(e=>e.finished).length;
  const nextUnfinished = bootstrap.events.find(e=>!e.finished)?.id;
  const first = new Date(bootstrap.events[0].deadline_time);
  const year = first.getUTCFullYear() - (first.getUTCMonth() < 6 ? 1 : 0);
  return {
    schema: 2, season: `${year}-${year+1}`, gameweek: event.id,
    deadline: event.deadline_time, capturedAt,
    leadHours: (Date.parse(event.deadline_time)-now)/3600000,
    modelHash, modelVersion, completedGameweeks: completed,
    isNextGameweek: event.id === nextUnfinished,
    fixtures, // Preserve historical opponent inputs as well as target fixtures.
    comparisonVersion: "heuristic-v1",
    players: bootstrap.elements.map(player => {
      const options = {player,fixtures,gameweek:event.id,completedGameweeks:completed,isNextGameweek:event.id===nextUnfinished};
      const breakdown = predictPlayerBreakdown(options);
      const predicted = breakdown.total;
      const comparison = predictV1(options);
      const baseline = Number(player.points_per_game) || 0;
      if (!Number.isFinite(predicted)) throw new Error("Non-finite forecast");
      return {id:player.id,name:player.web_name,position:player.element_type,
        predicted,baseline,comparison,components:breakdown.components,fixturePredictions:breakdown.fixtures,inputs:player};
    }),
  };
}

export function metrics(rows) {
  if (!rows.length) return null;
  const n=rows.length;
  return {
    count:n,
    mae:rows.reduce((s,r)=>s+Math.abs(r.predicted-r.actual),0)/n,
    rmse:Math.sqrt(rows.reduce((s,r)=>s+(r.predicted-r.actual)**2,0)/n),
    bias:rows.reduce((s,r)=>s+r.predicted-r.actual,0)/n,
    baselineMae:rows.reduce((s,r)=>s+Math.abs(r.baseline-r.actual),0)/n,
  };
}

export function evaluateSnapshot(snapshot, event, live, scoredAt) {
  if (!(Date.parse(snapshot.capturedAt) < Date.parse(snapshot.deadline)))
    throw new Error("Rejecting post-deadline forecast");
  if (!event || event.id!==snapshot.gameweek || !event.finished || !event.data_checked) return null;
  if (!Array.isArray(live.elements) || !live.elements.length) throw new Error("Missing actual points");
  const actuals = new Map(live.elements.map(p=>[p.id,p]));
  const rows = snapshot.players.map(player=>{
    const record=actuals.get(player.id);
    const stats=record?.stats;
    const actual=stats?.total_points;
    const minutes=stats?.minutes;
    const valid=Number.isFinite(actual) && Number.isFinite(minutes);
    return {id:player.id,name:player.name,position:player.position,predicted:player.predicted,
      baseline:player.baseline,actual:valid?actual:null,minutes:valid?minutes:null,
      error:valid?player.predicted-actual:null,
      comparison:player.comparison ?? null, predictedComponents:player.components ?? null,
      actualComponents:valid?actualComponents(record):null,actualStats:stats ?? null,
      actualExplanation:record?.explain ?? null};
  });
  const matched=rows.filter(r=>r.actual!==null);
  return {season:snapshot.season,gameweek:snapshot.gameweek,modelHash:snapshot.modelHash,
    modelVersion:snapshot.modelVersion,comparisonVersion:snapshot.comparisonVersion,
    capturedAt:snapshot.capturedAt,deadline:snapshot.deadline,leadHours:snapshot.leadHours,scoredAt,
    missing:rows.length-matched.length,all:metrics(matched),
    appeared:metrics(matched.filter(r=>r.minutes>0)),
    positions:Object.fromEntries([1,2,3,4].map(p=>[p,metrics(matched.filter(r=>r.position===p))])),
    comparison:metrics(matched.filter(r=>Number.isFinite(r.comparison)).map(r=>({...r,predicted:r.comparison}))),
    comparisonAppeared:metrics(matched.filter(r=>r.minutes>0 && Number.isFinite(r.comparison)).map(r=>({...r,predicted:r.comparison}))),
    components:Object.fromEntries(COMPONENTS.map(key=>[key,componentMetrics(matched,key)])),
    rows};
}

const identifiers = {
  minutes:"appearance", goals_scored:"goals", assists:"assists", clean_sheets:"cleanSheets",
  saves:"saves", bonus:"bonus", defensive_contribution:"defensiveContributions",
  goals_conceded:"goalsConceded", yellow_cards:"yellowCards", red_cards:"redCards",
  own_goals:"ownGoals", penalties_missed:"penaltiesMissed", penalties_saved:"penaltiesSaved",
};
export function actualComponents(record) {
  // Sum official point awards per fixture. GW totals lose threshold/reset information in doubles.
  if (!Array.isArray(record?.explain) || !record.explain.length) return null;
  const values=Object.fromEntries([...COMPONENTS,"other"].map(k=>[k,0]));
  for(const fixture of record.explain) {
    if (!Array.isArray(fixture.stats)) return null;
    for(const stat of fixture.stats) {
      if (!Number.isFinite(stat.points)) return null;
      values[identifiers[stat.identifier] || "other"] += stat.points;
    }
  }
  // Incomplete explanations must not create bogus component accuracy.
  return Math.abs(Object.values(values).reduce((s,n)=>s+n,0)-record.stats.total_points)<1e-8 ? values : null;
}
function componentMetrics(rows,key) {
  const pairs=rows.filter(r=>Number.isFinite(r.predictedComponents?.[key]) && Number.isFinite(r.actualComponents?.[key]));
  if(!pairs.length) return null;
  const errors=pairs.map(r=>r.predictedComponents[key]-r.actualComponents[key]);
  return {count:errors.length,mae:errors.reduce((s,x)=>s+Math.abs(x),0)/errors.length,
    bias:errors.reduce((s,x)=>s+x,0)/errors.length};
}
