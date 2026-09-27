import assert from "node:assert/strict";
import { recommendTransfers, validateSquad } from "../assets/recommendations.mjs";
import { anchoredBank, validBankAnchor } from "../assets/draft-budget.mjs";
const positions=[1,1,2,2,2,2,2,3,3,3,3,3,4,4,4];
const players=positions.map((element_type,i)=>({id:i+1,element_type,team:i+1,now_cost:50,status:"a"}));
const squad=players.map((p,i)=>({element:p.id,position:i+1}));
const scores=Object.fromEntries(players.map(p=>[p.id,[p.id===1?10:2,p.id===1?10:2]]));
const sellingPrices=Object.fromEntries(players.map(p=>[p.id,50]));
const base={squad,players,weeks:[6,7],scores,bank:0,freeTransfers:1,sellingPrices};
const add=(extra,changed={})=>({...base,players:[...players,...extra],scores:{...scores,...Object.fromEntries(extra.map(p=>[p.id,p.forecast||[8,8]]))},...changed});
const candidate={id:30,element_type:2,team:20,now_cost:50,status:"a"};
let result=recommendTransfers(add([candidate]));
const single=result.choices.find(c=>c.kind==="single");
assert(single.netGain>0);assert.equal(single.hit,0);assert.equal(single.bank,0);
for(const option of result.choices) {
  validateSquad(option.squad,new Map([...players,candidate].map(p=>[p.id,p])));
  const xi=option.squad.filter(s=>s.position<=11);assert.equal(xi.length,11);
  const map=new Map([...players,candidate].map(p=>[p.id,p]));
  assert(xi.filter(s=>map.get(s.element).element_type===2).length>=3);
  assert(xi.filter(s=>map.get(s.element).element_type===4).length>=1);
}
assert.equal(recommendTransfers(add([candidate],{freeTransfers:0})).choices.length,1);
const hit=recommendTransfers(add([candidate],{freeTransfers:0,allowHits:true})).choices.find(c=>c.kind==="single");
assert.equal(hit.hit,4);assert.equal(hit.netGain,hit.grossGain-4);assert.equal(hit.nextGain,hit.weekly[0]-result.baseline[0]-4);
assert.equal(recommendTransfers(add([candidate],{locks:players.map(p=>p.id)})).choices.length,1);
assert.equal(recommendTransfers(add([{...candidate,now_cost:51}])).choices.length,1);
assert.equal(recommendTransfers(add([candidate],{sellingPrices:{...sellingPrices,3:49,4:49,5:49,6:49,7:49}})).choices.length,1);
assert.equal(recommendTransfers(add([{...candidate,status:"i"}])).choices.length,1);
assert.equal(recommendTransfers(add([{...candidate,chance_of_playing_next_round:50}])).choices.length,1);
// Improving only the reserve keeper must not create an XI gain.
const bench=recommendTransfers(add([{...candidate,element_type:1,forecast:[5,5]}],{locks:[1]})).choices.find(c=>c.kind==="single");
assert.equal(bench.netGain,0);assert(!bench.recommended);
// Two linked moves unlock a premium that cannot be bought alone.
const pair=recommendTransfers(add([{...candidate,id:30,element_type:3,now_cost:70,forecast:[15,15]},
  {...candidate,id:31,element_type:2,now_cost:30,forecast:[2,2]}],{freeTransfers:2}));
const combo=pair.choices.find(c=>c.kind==="combo");assert(combo.netGain>0);assert.equal(combo.bank,0);assert.equal(combo.moves.length,2);
// Three-per-club check applies to the final combined squad.
const crowded=players.map(p=>({...p,team:p.id<=3?1:p.team}));
const clubResult=recommendTransfers(add([{...candidate,team:1}],{players:[...crowded,{...candidate,team:1}],locks:[1,2,3]}));
assert.equal(clubResult.choices.length,1);
assert.throws(()=>recommendTransfers({...base,bank:-1}));
assert.throws(()=>recommendTransfers({...base,freeTransfers:6}));
assert.throws(()=>recommendTransfers({...base,squad:squad.slice(1)}));
assert.throws(()=>recommendTransfers({...base,sellingPrices:{...sellingPrices,1:51}}));
assert.throws(()=>recommendTransfers({...base,scores:{...scores,1:[NaN,1]}}));
const map=new Map(players.map(p=>[p.id,p])),anchor={bank:7,elements:squad.map(s=>s.element)};
assert(validBankAnchor(anchor,map));assert.equal(anchoredBank(anchor,squad,map),7);
assert.equal(anchoredBank(anchor,squad.map((s,i)=>i? s:{...s,element:null}),map),57);
assert.equal(anchoredBank({...anchor,elements:Array(15).fill(1)},squad,map),null);
console.log("Recommendations: budgets, selling prices, FT/hits, locks, formation, clubs, bench gains, combinations, availability and bank handoff passed.");
