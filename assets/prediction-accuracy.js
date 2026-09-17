const target=document.querySelector("#accuracyReport");
const fmt=value=>Number.isFinite(value)?value.toFixed(2):"—";
try {
  const response=await fetch("data/predictions/summary.json",{cache:"no-store"});
  if(!response.ok) throw new Error("Archive unavailable");
  const summary=await response.json();
  target.replaceChildren();
  for(const pending of summary.pending){
    const note=document.createElement("p");
    note.textContent=`GW ${pending.gameweek}: predictions saved. Awaiting results.`;
    target.append(note);
  }
  if(!summary.reports.length && !summary.pending.length){
    const empty=document.createElement("p");
    empty.textContent="Results will appear after the first tracked gameweek.";
    target.append(empty);
  } else if(summary.reports.length) {
    const wrap=document.createElement("div");
    wrap.style.overflowX="auto";
    const table=document.createElement("table");
    const head=document.createElement("thead");
    const hr=document.createElement("tr");
    for(const label of ["Gameweek / model","Cohort","Players","MAE","RMSE","Bias","Baseline MAE","Captured","Missing"]){
      const th=document.createElement("th");th.scope="col";th.textContent=label;hr.append(th);
    }
    head.append(hr);table.append(head);
    const body=document.createElement("tbody");
    for(const report of [...summary.reports].reverse()){
      for(const [name,stats] of [["All",report.all],["Appeared",report.appeared],
        ...[ ["v1 comparison (all)",report.comparison], ["v1 comparison (appeared)",report.comparisonAppeared] ].filter(([,stats])=>stats),
        ...[["GK",1],["DEF",2],["MID",3],["FWD",4]].map(([name,id])=>[name,report.positions[id]])]){
        const tr=document.createElement("tr");
        for(const value of [`${report.season} GW ${report.gameweek} / ${report.modelVersion || "heuristic-v1"} ${report.modelHash.slice(0,8)}`,
          name,stats?.count||0,fmt(stats?.mae),fmt(stats?.rmse),fmt(stats?.bias),fmt(stats?.baselineMae),
          new Date(report.capturedAt).toLocaleString(),report.missing]){
          const td=document.createElement("td");td.textContent=String(value);tr.append(td);
        }
        body.append(tr);
      }
    }
    table.append(body);wrap.append(table);target.append(wrap);
    for (const report of [...summary.reports].reverse()) {
      if (!/^\d{4}-\d{4}$/.test(report.season) || !Number.isInteger(report.gameweek)) continue;
      const p=document.createElement("p");
      const link=document.createElement("a");
      link.href=`data/predictions/${report.season}-gw${report.gameweek}.result.json`;
      link.textContent=`Download player-by-player predictions and actuals: ${report.season} GW ${report.gameweek}`;
      p.append(link);target.append(p);
    }

  }
} catch {
  target.textContent="Results unavailable. Please try again later.";
}
