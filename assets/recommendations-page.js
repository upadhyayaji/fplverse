import { parseEntryId, buildDemoSquad, validatePlannerData } from "./planner-onboarding.mjs";
import { loadHistory } from "./prediction-history.mjs";
import { validateSquad } from "./recommendations.mjs";
import { fixtureInfoForTeam } from "./predictor-data.mjs";
import { anchoredBank } from "./draft-budget.mjs";
const $=id=>document.getElementById(id);
const money=n=>`£${(n/10).toFixed(1)}m`;
const points=n=>`${n>=0?"+":""}${n.toFixed(1)}`;
const roles={1:"GK",2:"DEF",3:"MID",4:"FWD"};
let state=null, worker=null, busy=false;
function status(text,error=false) { $("recommendStatus").textContent=text;$("recommendStatus").className=`status${error?" error":""}`; }
function readStorage(key) { try { return localStorage.getItem(key); } catch { return null; } }
function parseSaved(raw) { try { return JSON.parse(raw); } catch { return null; } }
function setBusy(value) {
  busy=value;
  for(const form of [$("recommendLoad"),$("recommendSettings")]) for(const el of form.querySelectorAll("input,select,button")) el.disabled=value;
}
function invalidate() {
  $("recommendOutput").hidden=true;
  if(state) state.result=null;
}
async function api(path) {
  const base=String(window.FPLVERSE_CONFIG?.apiBaseUrl||"").replace(/\/$/,"");
  if(!base) throw new Error("Live FPL service is not configured.");
  const response=await fetch(base+path,{signal:AbortSignal.timeout(25000),cache:"no-store"});
  if(!response.ok) {const e=new Error(`FPL data could not load (${response.status}). Please retry.`);e.status=response.status;throw e;}
  return response.json();
}
async function load(demo=false) {
  if(busy)return;
  setBusy(true);invalidate();$("recommendSettings").hidden=true;state=null;
  status("Loading players, squad and fixture predictions…");
  try {
    const entry=demo?"demo":parseEntryId($("recommendEntry").value);
    if(!entry)throw new Error("Enter a valid Entry ID or official FPL team URL.");
    const [bootstrap,fixtures]=await Promise.all([api("/api/bootstrap"),api("/api/fixtures")]);
    validatePlannerData(bootstrap,fixtures);await loadHistory(bootstrap);
    const upcoming=bootstrap.events.filter(e=>Date.parse(e.deadline_time)>Date.now()).sort((a,b)=>a.id-b.id).slice(0,6);
    if(!upcoming.length) throw new Error("No future gameweeks are available for this season.");
    const passed=bootstrap.events.filter(e=>Date.parse(e.deadline_time)<=Date.now()).sort((a,b)=>b.id-a.id);
    let picks,sourceGw;
    if(demo) {picks=buildDemoSquad(bootstrap.elements);sourceGw=passed[0]?.id||0;}
    else {
      for(const event of passed) {
        try { picks=await api(`/api/entry/${entry}/event/${event.id}/picks`);sourceGw=event.id;break; }
        catch(error) {if(error.status!==404)throw error;}
      }
      if(!picks)throw new Error("No published squad is available yet. Try a demo squad.");
    }
    const original=picks.picks, players=new Map(bootstrap.elements.map(p=>[p.id,p]));
    validateSquad(original,players);
    const key=demo?`fplverse-demo-draft-${sourceGw}-${original.map(p=>p.element).join("-")}`:`fplverse-planner-draft-${entry}`;
    const raw=readStorage(key),saved=parseSaved(raw);
    let draft=null;
    if(saved?.sourceGw===sourceGw) {try {validateSquad(saved.squad,players);draft=saved.squad;}catch{/* Incomplete drafts are not recommendation inputs. */}}
    state={entry,demo,bootstrap,fixtures,original,sourceGw,picks,players,key,draft,saved,draftRaw:raw,upcoming,loadedAt:Date.now()};
    $("recommendSource").options[1].disabled=!draft;
    $("recommendSource").value=draft?"draft":"original";
    $("recommendWeek").replaceChildren(...upcoming.map(e=>new Option(`GW ${e.id}`,e.id)));
    $("recommendHorizon").value="5";$("recommendHits").checked=false;
    $("recommendFree").value=demo?"1":"";
    $("recommendSettings").hidden=false;
    selectSquad();
    if(!demo) {try{localStorage.setItem("fplverse-entry-id",String(entry));}catch{/* Input remains usable. */}}
    status("Squad loaded. Confirm your transfer brief before running the search.");
  } catch(error) {status(error.message,true);}
  finally {setBusy(false);}
}
function selectSquad() {
  invalidate();$("recommendConfirmed").checked=false;
  const useDraft=$("recommendSource").value==="draft";
  state.squad=(useDraft?state.draft:state.original).map(s=>({...s}));
  const cost=squad=>squad.reduce((s,p)=>s+state.players.get(p.element).now_cost,0);
  const anchor=useDraft?state.saved?.bankAnchor:null;
  const confirmed=anchoredBank(anchor,state.squad,state.players);
  const bank=confirmed??(Number(state.picks.entry_history?.bank||0)+cost(state.original)-cost(state.squad));
  $("recommendBank").value=(bank/10).toFixed(1);
  $("recommendSourceNote").textContent=`${state.demo?"Sample squad":`Source: GW ${state.sourceGw} deadline`} · ${useDraft?"Planner draft":"Imported squad"} · Data fetched ${new Date(state.loadedAt).toLocaleTimeString()}. Bank and selling prices are estimates until you confirm them.${state.picks.active_chip==="freehit"?" This snapshot used Free Hit: correct the squad in the Planner to match your actual team before proceeding.":""}`;
  const teams=new Map(state.bootstrap.teams.map(t=>[t.id,t]));
  $("recommendRoster").replaceChildren();
  for(const slot of state.squad) {
    const p=state.players.get(slot.element),row=document.createElement("div");row.className="recommend-roster-row";
    const title=document.createElement("strong");title.textContent=p.web_name;
    const meta=document.createElement("small");meta.textContent=`${teams.get(p.team)?.short_name||""} · ${roles[p.element_type]} · Buy ${money(p.now_cost)}`;
    const label=document.createElement("label");label.textContent="Selling price (£m)";
    const input=document.createElement("input");Object.assign(input,{type:"number",min:"0.1",max:String(p.now_cost/10),step:"0.1",value:(p.now_cost/10).toFixed(1),required:true});input.dataset.sell=p.id;input.setAttribute("aria-label",`${p.web_name} selling price in millions`);label.append(input);
    const lockLabel=document.createElement("label");lockLabel.className="recommend-check";
    const lock=document.createElement("input");lock.type="checkbox";lock.dataset.lock=p.id;lockLabel.append(lock,document.createTextNode(`Keep ${p.web_name}`));
    row.append(title,meta,label,lockLabel);$("recommendRoster").append(row);
  }
}
function node(tag,text,className="") {const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
function addFixtures(container,player,weeks,scores) {
  const strip=node("div","","recommend-fixtures");
  const teams=new Map(state.bootstrap.teams.map(t=>[t.id,t]));
  weeks.forEach((gw,i)=>{
    const f=fixtureInfoForTeam(state.fixtures,teams,player.team,gw);
    const cell=node("div",`GW ${gw}`,`recommend-fixture fdr-${f.difficulty}`);
    cell.append(node("strong",`${scores[player.id][i].toFixed(1)} pts`),node("span",f.label));strip.append(cell);
  });container.append(strip);
}
function render(result,scores) {
  state.result=result;
  $("recommendResults").replaceChildren();
  $("recommendSummary").textContent=`GW ${result.weeks.join(", ")} · ${result.examined.toLocaleString()} legal options evaluated · ${result.weeks.length} week${result.weeks.length===1?"":"s"} available in this horizon. Only selectable, available players with no known chance below 75% are considered for purchase.`;
  for(const option of result.choices) {
    const card=node("article","",`panel recommend-card${option.recommended?" is-preferred":""}`);
    card.append(node("span",option.recommended?"RECOMMENDED":"ALTERNATIVE","recommend-tag"),node("h3",({hold:"Hold your squad",single:"Best single transfer",combo:"Best two-transfer shortlist"})[option.kind]));
    card.append(node("div",`${points(option.netGain)} pts`,"recommend-gain"),node("p","Estimated Starting XI gain across the horizon, after hits."));
    card.append(node("p",`Selected GW: ${points(option.nextGain)} pts after hits · Hit: ${option.hit?`−${option.hit}`:"0"} pts · Bank: ${money(option.bank)} · Free transfers left: ${option.freeTransfersAfter}`));
    if(option.kind==="hold")card.append(node("p","Keep your players and preserve your remaining free transfers. Future rollover benefits are not assigned a points value."));
    else card.append(node("p",`${option.grossGain.toFixed(1)} estimated XI points gained before a ${option.hit}-point deduction. Both teams are re-optimized each week, so existing bench strength is already counted.`));
    for(const move of option.moves) {
      const out=state.players.get(move.out),incoming=state.players.get(move.in),section=node("div","","recommend-move");
      section.append(node("strong",`OUT ${out.web_name} · Sell ${money(state.sellingPrices[out.id])}`));addFixtures(section,out,result.weeks,scores);
      section.append(node("strong",`IN ${incoming.web_name} · Buy ${money(incoming.now_cost)}`));addFixtures(section,incoming,result.weeks,scores);
      if(incoming.news)section.append(node("p",`FPL status note: ${incoming.news}`));
      card.append(section);
    }
    const table=node("table","","recommend-week-table"),head=document.createElement("thead"),headRow=document.createElement("tr");
    for(const text of ["GW","Hold XI","This XI","Net gain"])headRow.append(node("th",text));head.append(headRow);table.append(head);
    const body=document.createElement("tbody");result.weeks.forEach((gw,i)=>{const tr=document.createElement("tr");tr.append(node("th",String(gw)),node("td",result.baseline[i].toFixed(1)),node("td",option.weekly[i].toFixed(1)),node("td",points(option.weekly[i]-result.baseline[i]-(i===0?option.hit:0))));body.append(tr);});table.append(body);card.append(table);
    if(option.moves.length && option.netGain>0) {
      const button=node("button","Apply to planner","button");button.type="button";button.addEventListener("click",()=>apply(option));card.append(button);
    }
    $("recommendResults").append(card);
  }
  if(!result.choices.some(o=>o.kind==="single"))$("recommendResults").append(node("p","No eligible single transfer within your budget, locks and points-hit settings.","recommend-note"));
  if(!result.choices.some(o=>o.kind==="combo"))$("recommendResults").append(node("p","No eligible two-transfer combination in the shortlist. Two free transfers or permission for hits are needed.","recommend-note"));
  $("recommendOutput").hidden=false;
}
function apply(option) {
  try {
    if(!state.result || !state.result.choices.includes(option))throw new Error("Run the recommendations again before applying.");
    if(readStorage(state.key)!==state.draftRaw)throw new Error("Your Planner draft changed in another tab. Reload the squad and rerun recommendations.");
    if(Date.now()-state.loadedAt>30*60*1000||Date.parse(state.upcoming.find(e=>e.id===state.result.weeks[0]).deadline_time)<=Date.now())throw new Error("This recommendation is stale. Reload live data before applying.");
    if(!window.confirm("Replace the saved Planner draft with this recommendation and optimize its starting XI for the selected gameweek? This does not submit any official FPL transfers."))return;
    localStorage.setItem(state.key,JSON.stringify({sourceGw:state.sourceGw,squad:option.squad,bankAnchor:{bank:option.bank,elements:option.squad.map(s=>s.element)}}));
    location.href=`planner.html?${state.demo?"demo=1":`entry=${state.entry}`}&gw=${state.result.weeks[0]}&from=recommendations`;
  }catch(error){status(error.message,true);}
}
async function run(event) {
  event.preventDefault();if(busy||!state)return;
  if(!$("recommendConfirmed").checked)return;
  invalidate();
  const start=Number($("recommendWeek").value),weeks=state.upcoming.filter(e=>e.id>=start).slice(0,Number($("recommendHorizon").value)).map(e=>e.id);
  if(Date.now()-state.loadedAt>30*60*1000||state.upcoming.some(e=>e.id===start&&Date.parse(e.deadline_time)<=Date.now())) {status("Data is stale or the deadline has passed. Reload your squad.",true);return;}
  const sellingPrices=Object.fromEntries([...document.querySelectorAll("[data-sell]")].map(e=>[e.dataset.sell,Math.round(Number(e.value)*10)]));
  const locks=[...document.querySelectorAll("[data-lock]:checked")].map(e=>Number(e.dataset.lock));
  state.sellingPrices=sellingPrices;
  setBusy(true);status("Comparing legal Starting XIs and transfer options…");
  try {
    const payload={squad:state.squad,players:state.bootstrap.elements,fixtures:state.fixtures,weeks,bank:Math.round(Number($("recommendBank").value)*10),freeTransfers:Number($("recommendFree").value),sellingPrices,locks,allowHits:$("recommendHits").checked,completedGameweeks:state.bootstrap.events.filter(e=>e.finished).length};
    const response=await new Promise((resolve,reject)=>{
      worker=new Worker(new URL("./recommendations-worker.mjs",import.meta.url),{type:"module"});
      const timer=setTimeout(()=>{worker.terminate();reject(new Error("Search took too long. Try a shorter horizon or lock more players."));},60000);
      worker.onmessage=({data})=>{clearTimeout(timer);worker.terminate();data.error?reject(new Error(data.error)):resolve(data);};
      worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(new Error("The recommendation engine could not run. Reload and try again."));};
      worker.postMessage(payload);
    });
    render(response.result,response.scores);status("Recommendations ready. Review the assumptions before applying to your Planner.");
  } catch(error){status(error.message,true);}finally{worker=null;setBusy(false);}
}
$("recommendLoad").addEventListener("submit",e=>{e.preventDefault();load();});
$("recommendDemo").addEventListener("click",()=>load(true));
$("recommendSource").addEventListener("change",selectSquad);
$("recommendSettings").addEventListener("submit",run);
$("recommendSettings").addEventListener("input",event=>{invalidate();if(event.target.id!=="recommendConfirmed")$("recommendConfirmed").checked=false;});
const params=new URLSearchParams(location.search),entry=params.get("entry")||readStorage("fplverse-entry-id");
if(entry)$("recommendEntry").value=entry;
if(params.get("demo")==="1")load(true);
