import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { makeSnapshot, evaluateSnapshot, metrics } from "./prediction-audit.mjs";

const root = fileURLToPath(new URL("../data/predictions/",import.meta.url));
await mkdir(root,{recursive:true});
async function get(path) {
  const response=await fetch("https://fantasy.premierleague.com/api"+path,{
    headers:{"User-Agent":"FPLVerse prediction audit","Accept":"application/json"},
    signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error(`FPL ${path}: HTTP ${response.status}`);
  return response.json();
}
const [bootstrap,fixtures]=await Promise.all([get("/bootstrap-static/"),get("/fixtures/")]);
const modelHash=createHash("sha256");
for(const file of ["predictions.mjs","predictions-v1.mjs"]) modelHash.update(file).update(await readFile(new URL("../assets/"+file,import.meta.url)));
const modelDigest=modelHash.digest("hex");
// Timestamp after both responses arrive. A job crossing the deadline cannot create a late forecast.
const snapshot=makeSnapshot(bootstrap,fixtures,new Date().toISOString(),modelDigest);
if(snapshot){
  const path=root+snapshot.season+"-gw"+snapshot.gameweek+".json";
  try { await writeFile(path,JSON.stringify(snapshot,null,2)+"\n",{flag:"wx"}); console.log("Frozen",path); }
  catch(error){if(error.code!=="EEXIST") throw error; console.log("Preserving existing forecast",path);}
} else console.log("No deadline within the next 24 hours; no forecast created.");

const reports=[];
const pending=[];
for(const file of (await readdir(root)).filter(f=>/^\d{4}-\d{4}-gw\d+\.json$/.test(f))){
  const frozen=JSON.parse(await readFile(root+file,"utf8"));
  const resultPath=root+file.replace(".json",".result.json");
  let result;
  try {result=JSON.parse(await readFile(resultPath,"utf8"));}
  catch(error){if(error.code!=="ENOENT") throw error;}
  // Only reconcile the current season. Retain older results without joining reused player IDs.
  const first=new Date(bootstrap.events[0].deadline_time);
  const start=first.getUTCFullYear()-(first.getUTCMonth()<6?1:0);
  const season=`${start}-${start+1}`;
  const event=bootstrap.events.find(e=>e.id===frozen.gameweek);
  if(frozen.season===season && event?.finished && event.data_checked){
    const live=await get(`/event/${frozen.gameweek}/live/`);
    result=evaluateSnapshot(frozen,event,live,new Date().toISOString());
    // Results can incorporate official corrections; forecasts are never overwritten.
    let old;
    try {old=JSON.parse(await readFile(resultPath,"utf8"));} catch(e){if(e.code!=="ENOENT")throw e;}
    if(old && JSON.stringify(old.rows)===JSON.stringify(result.rows)) result=old;
    else await writeFile(resultPath,JSON.stringify(result,null,2)+"\n");
  }
  if(result) reports.push(result);
  else pending.push({season:frozen.season,gameweek:frozen.gameweek,capturedAt:frozen.capturedAt,deadline:frozen.deadline});
}
reports.sort((a,b)=>a.season.localeCompare(b.season)||a.gameweek-b.gameweek);
const summary={schema:1,policy:"First successful capture within 24 hours before deadline; no historical backfills.",
  pending,reports:reports.map(({rows,...rest})=>rest),
  models:[...new Set(reports.map(r=>r.modelHash))].map(hash=>{
    const rows=reports.filter(r=>r.modelHash===hash).flatMap(r=>r.rows).filter(r=>r.actual!==null);
    return {modelHash:hash,all:metrics(rows),appeared:metrics(rows.filter(r=>r.minutes>0))};
  })};
await writeFile(root+"summary.json",JSON.stringify(summary,null,2)+"\n");
console.log(JSON.stringify({scored:reports.length,pending:pending.length}));
