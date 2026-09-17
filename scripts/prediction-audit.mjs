import { predictPlayerPoints } from "../assets/predictions.mjs";

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
    schema: 1, season: `${year}-${year+1}`, gameweek: event.id,
    deadline: event.deadline_time, capturedAt,
    leadHours: (Date.parse(event.deadline_time)-now)/3600000,
    modelHash, modelVersion: "heuristic-v1", completedGameweeks: completed,
    isNextGameweek: event.id === nextUnfinished,
    fixtures: fixtures.filter(f=>f.event===event.id),
    players: bootstrap.elements.map(player => {
      const predicted = predictPlayerPoints({player,fixtures,gameweek:event.id,
        completedGameweeks:completed,isNextGameweek:event.id===nextUnfinished});
      const baseline = Number(player.points_per_game) || 0;
      if (!Number.isFinite(predicted)) throw new Error("Non-finite forecast");
      return {id:player.id,name:player.web_name,position:player.element_type,
        predicted,baseline,inputs:player};
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
  const actuals = new Map(live.elements.map(p=>[p.id,p.stats]));
  const rows = snapshot.players.map(player=>{
    const stats=actuals.get(player.id);
    const actual=stats?.total_points;
    const minutes=stats?.minutes;
    const valid=Number.isFinite(actual) && Number.isFinite(minutes);
    return {id:player.id,name:player.name,position:player.position,predicted:player.predicted,
      baseline:player.baseline,actual:valid?actual:null,minutes:valid?minutes:null,
      error:valid?player.predicted-actual:null};
  });
  const matched=rows.filter(r=>r.actual!==null);
  return {season:snapshot.season,gameweek:snapshot.gameweek,modelHash:snapshot.modelHash,
    capturedAt:snapshot.capturedAt,deadline:snapshot.deadline,leadHours:snapshot.leadHours,scoredAt,
    missing:rows.length-matched.length,all:metrics(matched),
    appeared:metrics(matched.filter(r=>r.minutes>0)),
    positions:Object.fromEntries([1,2,3,4].map(p=>[p,metrics(matched.filter(r=>r.position===p))])),
    rows};
}
