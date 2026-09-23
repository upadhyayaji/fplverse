export function parseEntryId(value) {
  let text = String(value || "").trim();
  if (!/^\d+$/.test(text)) {
    try {
      const url = new URL(text);
      if (url.protocol !== "https:" || url.hostname !== "fantasy.premierleague.com") return null;
      text = url.pathname.match(/^\/entry\/(\d+)(?:\/|$)/)?.[1] || "";
    } catch { return null; }
  }
  const id = Number(text);
  return /^\d+$/.test(text) && Number.isInteger(id) && id >= 1 && id <= 100000000 ? id : null;
}

export function validatePlannerData(bootstrap, fixtures) {
  if (!Array.isArray(bootstrap?.elements) || !bootstrap.elements.length ||
      !Array.isArray(bootstrap.events) || !bootstrap.events.length ||
      !Array.isArray(bootstrap.teams) || !bootstrap.teams.length || !Array.isArray(fixtures))
    throw new Error("Player or fixture data is incomplete. Please try again.");
}

export function buildDemoSquad(players) {
  const pool = players.filter(p => p.can_select !== false && !p.removed && p.status === "a" &&
    Number.isInteger(p.now_cost) && p.now_cost > 0);
  const chosen = [];
  const fits = (p, squad) => !squad.some(x => x.id === p.id) && squad.filter(x=>x.team===p.team).length < 3;
  for (const [type, count] of [[1,2],[2,5],[3,5],[4,3]]) {
    const candidates = pool.filter(p=>p.element_type===type).sort((a,b)=>a.now_cost-b.now_cost || a.id-b.id);
    for(let i=0;i<count;i++) {
      const player = candidates.find(p=>fits(p,chosen));
      if(!player) throw new Error("A complete demo squad is unavailable. Please try again later.");
      chosen.push(player);
    }
  }
  let cost = chosen.reduce((s,p)=>s+p.now_cost,0);
  if(cost>1000) throw new Error("An affordable demo squad is unavailable.");
  // Upgrade a legal budget squad deterministically; this is a sample, not a recommendation.
  for(let i=0;i<chosen.length;i++) {
    const old=chosen[i], rest=chosen.filter((_,j)=>j!==i);
    const replacement=pool.filter(p=>p.element_type===old.element_type && fits(p,rest) && cost-old.now_cost+p.now_cost<=1000)
      .sort((a,b)=>Number(b.total_points||0)-Number(a.total_points||0) || a.now_cost-b.now_cost || a.id-b.id)[0];
    cost += replacement.now_cost-old.now_cost; chosen[i]=replacement;
  }
  const byType = type => chosen.filter(p=>p.element_type===type).sort((a,b)=>Number(b.total_points||0)-Number(a.total_points||0)||a.id-b.id);
  const [gk,def,mid,fwd]=[1,2,3,4].map(byType);
  const lineup=[gk[0],...def.slice(0,4),...mid.slice(0,4),...fwd.slice(0,2),gk[1],def[4],mid[4],fwd[2]];
  const captains=[...lineup.slice(0,11)].sort((a,b)=>Number(b.total_points||0)-Number(a.total_points||0)||a.id-b.id);
  return {entry_history:{bank:1000-cost},picks:lineup.map((p,i)=>({element:p.id,position:i+1,is_captain:p.id===captains[0].id,is_vice_captain:p.id===captains[1].id}))};
}
export function freshnessText({demo,sourceGw,activeGw,fetchedAt,now=Date.now(),failed=false}) {
  const minutes=Math.max(0,Math.floor((now-fetchedAt)/60000));
  const age=minutes<1?"just now":minutes===1?"1 minute ago":`${minutes} minutes ago`;
  return `${demo?"Demo squad":`Squad from GW${sourceGw} deadline`} · Data fetched ${age} · Viewing GW${activeGw}${failed?" · Refresh failed; showing previously loaded data":""}`;
}
