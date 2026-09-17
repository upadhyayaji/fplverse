import assert from "node:assert/strict";
import { optimizeSquad } from "../assets/optimizer.mjs";
const types = [1,2,2,2,3,3,3,3,4,4,4,1,2,2,3];
const squad = types.map((type, index) => ({ element:index+1, position:index+1, is_captain:index===1 }));
const players = new Map(types.map((type,index)=>[index+1,{id:index+1,element_type:type}]));
const score = p => p.id;
const result = optimizeSquad(squad, players, score);
assert.equal(new Set(result.map(s=>s.element)).size,15);
const xi = result.slice(0,11);
const counts = [1,2,3,4].map(t=>xi.filter(s=>players.get(s.element).element_type===t).length);
assert.equal(counts[0],1);
assert.ok(counts[1]>=3 && counts[1]<=5);
assert.ok(counts[2]>=2 && counts[2]<=5);
assert.ok(counts[3]>=1 && counts[3]<=3);
assert.equal(result.find(s=>s.is_captain).element,15);
assert.equal(result.find(s=>s.is_vice_captain).element,14);
assert.equal(players.get(result[11].element).element_type,1);
let bruteBest = -Infinity;
for(let mask=0;mask<(1<<15);mask++){
  const chosen=squad.filter((_,i)=>mask&(1<<i));
  if(chosen.length!==11) continue;
  const n=[1,2,3,4].map(t=>chosen.filter(s=>players.get(s.element).element_type===t).length);
  if(n[0]===1 && n[1]>=3 && n[1]<=5 && n[2]>=2 && n[2]<=5 && n[3]>=1 && n[3]<=3)
    bruteBest=Math.max(bruteBest,chosen.reduce((sum,s)=>sum+score(players.get(s.element)),0));
}
assert.equal(xi.reduce((sum,s)=>sum+score(players.get(s.element)),0),bruteBest);
assert.throws(()=>optimizeSquad(squad.slice(1),players,score),/15/);
assert.deepEqual(optimizeSquad(result,players,score),result);
assert.equal(squad[0].element,1);
console.log("Optimizer: legal formation, global optimum, captaincy, completeness and idempotence passed.");
