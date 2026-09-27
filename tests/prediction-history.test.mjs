import assert from "node:assert/strict";
import { attachHistory, historicalPrior } from "../assets/prediction-history.mjs";
import { predictPlayerPoints } from "../assets/predictions.mjs";
import { predictPlayerPoints as v2 } from "../assets/predictions-v2.mjs";
const bootstrap=()=>({events:[{deadline_time:"2026-08-21T17:30:00Z"}],elements:[{id:55,code:123,team:1,element_type:4,minutes:90,starts:1,goals_scored:0,expected_goals:"0",assists:0,expected_assists:"0",status:"a"}]});
const archive={schema:1,season:2026,capturedAt:"2026-09-01T00:00:00Z",source:"official",players:{123:{code:123,seasons:[
  {season_name:"2025/26",element_code:123,minutes:2700,expected_goals:24,goals_scored:25},
  {season_name:"2024/25",element_code:123,minutes:1800,expected_goals:10,goals_scored:12},
  {season_name:"2026/27",element_code:123,minutes:90,expected_goals:1000},
  {season_name:"2025/26",element_code:999,minutes:90,expected_goals:1000}
]}}};
const b=bootstrap();
assert(attachHistory(b,archive));
const p=b.elements[0];
assert.equal(p.prediction_history.seasons.length,2);
assert.equal(historicalPrior(p,"expected_goals",.38),(90*29+450*.38)/4050);
assert.equal(historicalPrior(p,"saves",3),3); // Missing is not zero.
assert.equal(historicalPrior(p,"defensive_contribution",8),8); // Scoring definitions changed.
assert(!attachHistory(bootstrap(),{...archive,season:2025}));
assert(!attachHistory(bootstrap(),{...archive,capturedAt:"2099-01-01"}));
const moved=bootstrap(); moved.elements[0].team=20; assert(attachHistory(moved,archive));
assert.equal(moved.elements[0].prediction_history.seasons.length,2); // Player, not club identity.
const fixtures=[{id:1,event:2,team_h:1,team_a:2,team_h_difficulty:3}];
const options={player:p,fixtures,gameweek:2,completedGameweeks:1};
assert(predictPlayerPoints(options)>v2(options));
assert.equal(predictPlayerPoints({...options,player:bootstrap().elements[0]}),v2({...options,player:bootstrap().elements[0]}));
assert.equal(predictPlayerPoints({...options,fixtures:[]}),0);
assert.equal(predictPlayerPoints({...options,player:{...p,chance_of_playing_next_round:0}}),0);
const early=predictPlayerPoints(options)-v2(options);
const later={...options,player:{...p,minutes:3000,starts:34},completedGameweeks:34};
assert(predictPlayerPoints(later)-v2(later)<early);
console.log("Historical priors: recency, identity, season, missing data, fallback, blanks, availability and fading influence passed.");
