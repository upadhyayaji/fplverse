import { mkdir, writeFile, rename } from "node:fs/promises";
import { HISTORY_FIELDS, seasonStart } from "../assets/prediction-history.mjs";
const base = "https://fantasy.premierleague.com/api";
async function get(path) {
  for (let attempt=0; attempt<3; attempt++) {
    try {
      const response = await fetch(base+path, {signal:AbortSignal.timeout(30000), headers:{Accept:"application/json", "User-Agent":"FPLVerse historical priors"}});
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
      return await response.json();
    } catch(error) { if(attempt===2) throw error; await new Promise(r=>setTimeout(r,2000*(attempt+1))); }
  }
}
const bootstrap = await get("/bootstrap-static/");
const season = seasonStart(bootstrap);
if (!Number.isInteger(season) || !bootstrap.elements?.length) throw new Error("Invalid bootstrap");
const players = {}, queue = [...bootstrap.elements];
let done=0;
await Promise.all(Array.from({length:4},async()=>{
  while(queue.length) {
    const player=queue.shift(), summary=await get(`/element-summary/${player.id}/`);
    if (!Array.isArray(summary.history_past)) throw new Error(`Missing history for ${player.id}`);
    const seasons=summary.history_past.filter(row=>row.element_code===player.code && [1,2].includes(season-Number(row.season_name?.slice(0,4))))
      .map(row=>Object.fromEntries(["season_name","element_code","minutes",...HISTORY_FIELDS].filter(key=>key in row).map(key=>[key,row[key]])));
    players[player.code]={code:player.code,seasons};
    if(++done%50===0) console.log(`Collected ${done}/${bootstrap.elements.length}`);
    await new Promise(r=>setTimeout(r,250));
  }
}));
const archive={schema:1,season,capturedAt:new Date().toISOString(),source:base+"/element-summary/{id}/",players};
const destination=new URL("../data/player-history.json",import.meta.url);
await mkdir(new URL("../data/",import.meta.url),{recursive:true});
await writeFile(new URL("../data/player-history.tmp",import.meta.url),JSON.stringify(archive)+"\n");
await rename(new URL("../data/player-history.tmp",import.meta.url),destination);
console.log(`Saved ${done} players; ${Object.values(players).filter(p=>p.seasons.length).length} have recent PL history`);
