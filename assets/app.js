import {
  datasetToCsv,
  latestRow,
  summarizeDataset,
  validateDataset,
} from "./analytics.mjs";

const COLORS = ["#b7ff45", "#58d7ff", "#ff6ec7", "#ffb649", "#9b87ff", "#38e8b0", "#ff7575"];
const state = { payload: null, mode: "cumulative", hiddenManagers: new Set() };

const elements = {
  analyticsTable: document.querySelector("#analyticsTable"),
  avgFoot: document.querySelector("#avgFoot"),
  avgValue: document.querySelector("#avgValue"),
  bestGwFoot: document.querySelector("#bestGwFoot"),
  bestGwValue: document.querySelector("#bestGwValue"),
  chartDescription: document.querySelector("#chartDescription"),
  chartTooltip: document.querySelector("#chartTooltip"),
  chartWrap: document.querySelector("#chartWrap"),
  comebackFoot: document.querySelector("#comebackFoot"),
  comebackValue: document.querySelector("#comebackValue"),
  consistentFoot: document.querySelector("#consistentFoot"),
  consistentValue: document.querySelector("#consistentValue"),
  dataNote: document.querySelector("#dataNote"),
  downloadButton: document.querySelector("#downloadButton"),
  gameweekCount: document.querySelector("#gameweekCount"),
  heroLeaderName: document.querySelector("#heroLeaderName"),
  heroLeaderScore: document.querySelector("#heroLeaderScore"),
  heroLeaderTeam: document.querySelector("#heroLeaderTeam"),
  jsonUpload: document.querySelector("#jsonUpload"),
  leaderboard: document.querySelector("#leaderboard"),
  leagueAverage: document.querySelector("#leagueAverage"),
  legend: document.querySelector("#legend"),
  managerCount: document.querySelector("#managerCount"),
  scoreChart: document.querySelector("#scoreChart"),
  seasonLabel: document.querySelector("#seasonLabel"),
  status: document.querySelector("#status"),
  updatedLabel: document.querySelector("#updatedLabel"),
  winningGap: document.querySelector("#winningGap"),
};

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = String(value ?? "");
  return node.innerHTML;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-GB").format(Math.round(value));
}

function setStatus(message, type = "") {
  elements.status.textContent = message;
  elements.status.className = `status ${type}`.trim();
}

function renderSummary(summary) {
  const { leader, standings } = summary;
  elements.seasonLabel.textContent = `${state.payload.season} season`;
  elements.heroLeaderName.textContent = leader.name;
  elements.heroLeaderTeam.textContent = leader.team_name || `Entry ${leader.id}`;
  elements.heroLeaderScore.textContent = formatNumber(leader.total);
  elements.managerCount.textContent = standings.length;
  elements.gameweekCount.textContent = `GW ${summary.gameweek}`;
  elements.winningGap.textContent = `+${formatNumber(summary.winningGap)}`;
  elements.leagueAverage.textContent = formatNumber(summary.leagueAverage / summary.gameweek);

  elements.bestGwValue.textContent = `${summary.bestWeek.best.points} pts`;
  elements.bestGwFoot.textContent = `${summary.bestWeek.name} · GW ${summary.bestWeek.best.gameweek}`;
  elements.consistentValue.textContent = summary.consistent.name;
  elements.consistentFoot.textContent = `${summary.consistent.standardDeviation.toFixed(1)} pt weekly deviation`;
  elements.comebackValue.textContent =
    summary.comeback.improvement > 0 ? `+${summary.comeback.improvement} places` : "Held position";
  elements.comebackFoot.textContent = summary.comeback.manager.name;
  elements.avgValue.textContent = summary.highestAverage.average.toFixed(1);
  elements.avgFoot.textContent = `${summary.highestAverage.name} · points per GW`;

  const generated = state.payload.generated_at ? new Date(state.payload.generated_at) : null;
  elements.updatedLabel.textContent =
    generated && !Number.isNaN(generated.valueOf())
      ? `Updated ${generated.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : `Through gameweek ${summary.gameweek}`;
  elements.dataNote.textContent =
    state.payload.demo === true
      ? "Showing fictional demo data."
      : `Tracking ${standings.length} configured managers.`;
}

function renderLeaderboard(standings) {
  const leaderScore = standings[0].total;
  elements.leaderboard.innerHTML = standings
    .map((manager, index) => {
      const movement = manager.history.length > 1
        ? manager.history.at(-1).points - manager.history.at(-2).points
        : manager.history.at(-1).points;
      return `
        <article class="leaderboard-row">
          <span class="rank ${index < 3 ? "rank-top" : ""}">${String(manager.rank).padStart(2, "0")}</span>
          <span class="manager-swatch" style="--manager-color:${COLORS[index % COLORS.length]}"></span>
          <span class="manager-name">
            <strong>${escapeHtml(manager.name)}</strong>
            <small>${escapeHtml(manager.team_name || `Entry ${manager.id}`)}</small>
          </span>
          <span class="manager-form" title="Latest gameweek score">${movement}</span>
          <span class="manager-total">
            <strong>${formatNumber(manager.total)}</strong>
            <small>${manager.rank === 1 ? "Leader" : `−${formatNumber(leaderScore - manager.total)}`}</small>
          </span>
        </article>`;
    })
    .join("");
}

function renderTable(standings) {
  const leaderScore = standings[0].total;
  elements.analyticsTable.innerHTML = standings
    .map(
      (manager) => `
        <tr>
          <td><span class="table-rank">${manager.rank}</span></td>
          <td>
            <div class="table-manager">
              <strong>${escapeHtml(manager.name)}</strong>
              <span>${escapeHtml(manager.team_name || `Entry ${manager.id}`)}</span>
            </div>
          </td>
          <td><strong>${formatNumber(manager.total)}</strong></td>
          <td>${manager.average.toFixed(1)}</td>
          <td><strong>${manager.best.points}</strong> <span class="subtle">GW ${manager.best.gameweek}</span></td>
          <td><strong>${manager.worst.points}</strong> <span class="subtle">GW ${manager.worst.gameweek}</span></td>
          <td>${manager.finalFive}</td>
          <td>${manager.rank === 1 ? "—" : `−${formatNumber(leaderScore - manager.total)}`}</td>
        </tr>`
    )
    .join("");
}

function renderLegend(standings) {
  elements.legend.innerHTML = standings
    .map(
      (manager, index) => `
        <button class="legend-item ${state.hiddenManagers.has(manager.id) ? "is-hidden" : ""}"
          data-manager-id="${manager.id}" type="button">
          <span style="--manager-color:${COLORS[index % COLORS.length]}"></span>
          ${escapeHtml(manager.name)}
        </button>`
    )
    .join("");
}

function svgElement(tag, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
  return node;
}

function renderChart(standings) {
  const svg = elements.scoreChart;
  const width = Math.max(elements.chartWrap.clientWidth, 620);
  const height = Math.max(380, Math.min(470, width * 0.54));
  const margin = { top: 28, right: 26, bottom: 42, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const allRows = standings.flatMap((manager) => manager.history);
  const gameweeks = [...new Set(allRows.map((row) => row.gameweek))].sort((a, b) => a - b);
  const field = state.mode === "weekly" ? "points" : "total_points";
  const values = allRows.map((row) => row[field]);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max(8, (rawMax - rawMin) * 0.08);
  const minValue = state.mode === "weekly" ? Math.max(0, rawMin - padding) : Math.max(0, rawMin - padding);
  const maxValue = rawMax + padding;
  const x = (gameweek) =>
    margin.left + ((gameweek - gameweeks[0]) / Math.max(1, gameweeks.at(-1) - gameweeks[0])) * innerWidth;
  const y = (value) =>
    margin.top + innerHeight - ((value - minValue) / Math.max(1, maxValue - minValue)) * innerHeight;

  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);

  const defs = svgElement("defs");
  const gradient = svgElement("linearGradient", { id: "chartFade", x1: "0", x2: "0", y1: "0", y2: "1" });
  gradient.append(
    svgElement("stop", { offset: "0%", "stop-color": "#b7ff45", "stop-opacity": "0.16" }),
    svgElement("stop", { offset: "100%", "stop-color": "#b7ff45", "stop-opacity": "0" })
  );
  defs.append(gradient);
  svg.append(defs);

  for (let index = 0; index <= 4; index += 1) {
    const value = minValue + ((maxValue - minValue) * index) / 4;
    const gridY = y(value);
    svg.append(
      svgElement("line", {
        x1: margin.left,
        y1: gridY,
        x2: width - margin.right,
        y2: gridY,
        class: "chart-grid",
      })
    );
    const label = svgElement("text", {
      x: margin.left - 12,
      y: gridY + 4,
      "text-anchor": "end",
      class: "chart-label",
    });
    label.textContent = formatNumber(value);
    svg.append(label);
  }

  const xStep = Math.max(1, Math.ceil(gameweeks.length / 8));
  gameweeks.forEach((gameweek, index) => {
    if (index % xStep !== 0 && index !== gameweeks.length - 1) return;
    const label = svgElement("text", {
      x: x(gameweek),
      y: height - 14,
      "text-anchor": "middle",
      class: "chart-label",
    });
    label.textContent = `GW${gameweek}`;
    svg.append(label);
  });

  standings.forEach((manager, index) => {
    if (state.hiddenManagers.has(manager.id)) return;
    const color = COLORS[index % COLORS.length];
    const points = manager.history.map((row) => [x(row.gameweek), y(row[field]), row]);
    const pathData = points
      .map(([pointX, pointY], pointIndex) => `${pointIndex === 0 ? "M" : "L"}${pointX.toFixed(2)},${pointY.toFixed(2)}`)
      .join(" ");
    svg.append(
      svgElement("path", {
        d: pathData,
        fill: "none",
        stroke: color,
        "stroke-width": index === 0 ? 3.5 : 2.4,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        class: "chart-line",
      })
    );

    points.forEach(([pointX, pointY, row]) => {
      const circle = svgElement("circle", {
        cx: pointX,
        cy: pointY,
        r: 4,
        fill: color,
        stroke: "#0a1510",
        "stroke-width": 2,
        class: "chart-point",
        tabindex: "0",
        role: "button",
        "aria-label": `${manager.name}, gameweek ${row.gameweek}, ${row[field]} points`,
      });
      circle.dataset.name = manager.name;
      circle.dataset.gameweek = row.gameweek;
      circle.dataset.value = row[field];
      circle.dataset.color = color;
      svg.append(circle);
    });
  });

  elements.chartDescription.textContent =
    state.mode === "weekly"
      ? "Gameweek score — select a name below to compare fewer lines"
      : "Cumulative points — select a name below to compare fewer lines";
}

function showTooltip(event) {
  const point = event.target.closest(".chart-point");
  if (!point) return;
  const chartBox = elements.chartWrap.getBoundingClientRect();
  const pointBox = point.getBoundingClientRect();
  elements.chartTooltip.innerHTML = `
    <strong>${escapeHtml(point.dataset.name)}</strong>
    <span>GW ${point.dataset.gameweek} · ${formatNumber(point.dataset.value)} pts</span>`;
  elements.chartTooltip.style.setProperty("--tooltip-color", point.dataset.color);
  elements.chartTooltip.style.left = `${pointBox.left - chartBox.left + pointBox.width / 2}px`;
  elements.chartTooltip.style.top = `${pointBox.top - chartBox.top}px`;
  elements.chartTooltip.classList.add("visible");
}

function hideTooltip() {
  elements.chartTooltip.classList.remove("visible");
}

function render() {
  const summary = summarizeDataset(state.payload);
  renderSummary(summary);
  renderLeaderboard(summary.standings);
  renderTable(summary.standings);
  renderLegend(summary.standings);
  renderChart(summary.standings);
}

async function loadDefaultData() {
  setStatus("Loading league data…");
  try {
    const response = await fetch("data/managers.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Data request failed with status ${response.status}.`);
    state.payload = validateDataset(await response.json());
    render();
    setStatus("");
  } catch (error) {
    setStatus(`FPLVerse could not load its league data. ${error.message}`, "error");
  }
}

elements.jsonUpload.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    state.payload = validateDataset(JSON.parse(await file.text()));
    state.hiddenManagers.clear();
    render();
    setStatus(`Loaded ${file.name}.`, "success");
  } catch (error) {
    setStatus(`Could not load ${file.name}: ${error.message}`, "error");
  } finally {
    event.target.value = "";
  }
});

elements.downloadButton.addEventListener("click", () => {
  if (!state.payload) return;
  const blob = new Blob([datasetToCsv(state.payload)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fplverse-${state.payload.season.replace("/", "-")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

document.querySelectorAll(".segment").forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    document.querySelectorAll(".segment").forEach((segment) =>
      segment.classList.toggle("active", segment === button)
    );
    renderChart(summarizeDataset(state.payload).standings);
  });
});

elements.legend.addEventListener("click", (event) => {
  const button = event.target.closest("[data-manager-id]");
  if (!button) return;
  const id = Number(button.dataset.managerId);
  if (state.hiddenManagers.has(id)) state.hiddenManagers.delete(id);
  else state.hiddenManagers.add(id);
  renderLegend(summarizeDataset(state.payload).standings);
  renderChart(summarizeDataset(state.payload).standings);
});

elements.scoreChart.addEventListener("pointerover", showTooltip);
elements.scoreChart.addEventListener("focusin", showTooltip);
elements.scoreChart.addEventListener("pointerout", hideTooltip);
elements.scoreChart.addEventListener("focusout", hideTooltip);

const resizeObserver = new ResizeObserver(() => {
  if (state.payload) renderChart(summarizeDataset(state.payload).standings);
});
resizeObserver.observe(elements.chartWrap);

loadDefaultData();
