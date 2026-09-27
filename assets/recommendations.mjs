import { optimizeSquad } from "./optimizer.mjs";

const sizes = {1:2,2:5,3:5,4:3};
export function validateSquad(squad, players) {
  if (!Array.isArray(squad) || squad.length !== 15 || new Set(squad.map(s=>s.element)).size !== 15) throw new Error("Fill all 15 unique squad slots in the Planner first.");
  const positions={}, clubs={};
  for (const slot of squad) {
    const p=players.get(slot.element);
    if (!p || !sizes[p.element_type]) throw new Error("Squad contains an unavailable player or open slot.");
    positions[p.element_type]=(positions[p.element_type]||0)+1;
    clubs[p.team]=(clubs[p.team]||0)+1;
  }
  if(Object.entries(sizes).some(([k,n])=>positions[k]!==n)) throw new Error("Squad must contain 2 GK, 5 DEF, 5 MID and 3 FWD.");
  if(Object.values(clubs).some(n=>n>3)) throw new Error("Resolve the three-per-club limit in the Planner first.");
}

// Score the strongest legal XI independently each week, excluding captain doubling.
function weeklyTotals(ids, players, scores, weeks) {
  return weeks.map((_,w)=>{
    const groups={1:[],2:[],3:[],4:[]};
    for(const id of ids) groups[players.get(id).element_type].push(scores[id][w]);
    for(const list of Object.values(groups)) list.sort((a,b)=>b-a);
    const sum=(type,n)=>groups[type].slice(0,n).reduce((s,x)=>s+x,0);
    let best=-Infinity;
    for(let d=3;d<=5;d++) for(let m=2;m<=5;m++) {
      const f=10-d-m;
      if(f>=1 && f<=3) best=Math.max(best,sum(1,1)+sum(2,d)+sum(3,m)+sum(4,f));
    }
    return best;
  });
}

export function recommendTransfers({squad, players:catalog, weeks, scores, bank, freeTransfers, sellingPrices, locks=[], allowHits=false}) {
  const players=new Map(catalog.map(p=>[p.id,p]));
  validateSquad(squad,players);
  if(!Array.isArray(weeks)||!weeks.length||weeks.length>5||new Set(weeks).size!==weeks.length) throw new Error("Choose between one and five future gameweeks.");
  if(!Number.isInteger(bank)||bank<0) throw new Error("Confirm a non-negative bank in £0.1m steps.");
  if(!Number.isInteger(freeTransfers)||freeTransfers<0||freeTransfers>5) throw new Error("Confirm 0–5 free transfers remaining.");
  const ids=squad.map(s=>s.element), owned=new Set(ids), locked=new Set(locks);
  for(const id of ids) if(!Number.isInteger(sellingPrices[id])||sellingPrices[id]<=0||sellingPrices[id]>players.get(id).now_cost) throw new Error("Confirm each selling price; it cannot exceed the current purchase price.");
  for(const p of catalog) if(!Array.isArray(scores[p.id])||scores[p.id].length!==weeks.length||scores[p.id].some(n=>!Number.isFinite(n))) throw new Error("Predictions are incomplete. Reload and try again.");
  const available=catalog.filter(p=>!owned.has(p.id)&&p.can_select!==false&&!p.removed&&p.status==="a"&&Number.isInteger(p.now_cost)&&p.now_cost>0&&(p.chance_of_playing_next_round==null||Number(p.chance_of_playing_next_round)>=75));
  const total=id=>scores[id].reduce((s,n)=>s+n,0);
  const baseline=weeklyTotals(ids,players,scores,weeks), baseSum=baseline.reduce((s,n)=>s+n,0);
  const hold={kind:"hold",moves:[],bank,hit:0,weekly:baseline,grossGain:0,netGain:0,nextGain:0};
  let single=null,combo=null,examined=0;
  function consider(moves) {
    const hit=Math.max(0,moves.length-freeTransfers)*4;
    if(hit&&!allowHits) return;
    const remaining=bank+moves.reduce((s,m)=>s+sellingPrices[m.out]-players.get(m.in).now_cost,0);
    if(remaining<0 || new Set(moves.map(m=>m.in)).size!==moves.length) return;
    const replacements=new Map(moves.map(m=>[m.out,m.in]));
    const next=ids.map(id=>replacements.get(id)??id),clubs={};
    for(const id of next) { const team=players.get(id).team; clubs[team]=(clubs[team]||0)+1;if(clubs[team]>3)return; }
    examined++;
    const weekly=weeklyTotals(next,players,scores,weeks);
    const grossGain=weekly.reduce((s,n)=>s+n,0)-baseSum,netGain=grossGain-hit;
    const result={kind:moves.length===1?"single":"combo",moves,bank:remaining,hit,weekly,grossGain,netGain,nextGain:weekly[0]-baseline[0]-hit};
    const prev=moves.length===1?single:combo;
    if(!prev || result.netGain>prev.netGain+1e-8 || (Math.abs(result.netGain-prev.netGain)<1e-8&&remaining>prev.bank)) {
      if(moves.length===1)single=result;else combo=result;
    }
  }
  const unlocked=ids.filter(id=>!locked.has(id));
  if(freeTransfers>0||allowHits) for(const out of unlocked) for(const p of available) if(p.element_type===players.get(out).element_type) consider([{out,in:p.id}]);
  // Bounded pair search: points leaders + budget enablers + value candidates.
  const pools={};
  for(const type of [1,2,3,4]) {
    const all=available.filter(p=>p.element_type===type);
    const byPoints=[...all].sort((a,b)=>total(b.id)-total(a.id)||a.id-b.id).slice(0,8);
    const byCost=[...all].sort((a,b)=>a.now_cost-b.now_cost||total(b.id)-total(a.id)).slice(0,4);
    const byValue=[...all].sort((a,b)=>total(b.id)/b.now_cost-total(a.id)/a.now_cost||a.id-b.id).slice(0,4);
    pools[type]=[...new Map([...byPoints,...byCost,...byValue].map(p=>[p.id,p])).values()];
  }
  if(freeTransfers>=2||allowHits) for(let a=0;a<unlocked.length;a++) for(let b=a+1;b<unlocked.length;b++) {
    const outA=unlocked[a],outB=unlocked[b];
    for(const p of pools[players.get(outA).element_type]) for(const q of pools[players.get(outB).element_type]) consider([{out:outA,in:p.id},{out:outB,in:q.id}]);
  }
  const choices=[hold,...[single,combo].filter(Boolean)];
  // A transparent 2-point margin is a conservative heuristic, not calibrated confidence.
  let preferred=hold;
  for(const option of choices.slice(1)) if(option.netGain>=preferred.netGain+2) preferred=option;
  for(const option of choices) {
    const replacements=new Map(option.moves.map(m=>[m.out,m.in]));
    option.squad=optimizeSquad(squad.map(s=>({...s,element:replacements.get(s.element)??s.element})),players,p=>scores[p.id][0]);
    option.recommended=option===preferred;
    option.freeTransfersAfter=Math.max(0,freeTransfers-option.moves.length);
  }
  return {weeks,choices,examined,baseline,shortlistSizes:Object.fromEntries(Object.entries(pools).map(([k,v])=>[k,v.length]))};
}
