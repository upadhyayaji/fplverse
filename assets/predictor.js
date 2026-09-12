import { predictPlayerPoints, predictionMethodology } from "./predictions.mjs";
import { fixtureInfoForTeam, rankPlayersForWeeks } from "./predictor-data.mjs";

const API_BASE = String(window.FPLVERSE_CONFIG?.apiBaseUrl || "").replace(/\/$/, "");

const elements = {
  status: document.querySelector("#predictorStatus"),
  workspace: document.querySelector("#predictorWorkspace"),
  positionFilters: document.querySelector("#positionFilters"),
  gameweeks: document.querySelector("#predictorGameweeks"),
  head: document.querySelector("#predictionHead"),
  body: document.querySelector("#predictionBody"),
  summary: document.querySelector("#predictionSummary"),
  method: document.querySelector("#predictionMethod"),
};

const state = {
  bootstrap: null,
  fixtures: [],
  selectedPositions: new Set([1, 2, 3, 4]),
  selectedGameweeks: new Set(),
};

const positionLabels = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };

function apiUrl(path) {
  if (!API_BASE) throw new Error("The live FPL service is not configured.");
  return `${API_BASE}${path}`;
}

async function apiGet(path) {
  const response = await fetch(apiUrl(path), { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "FPL data could not be loaded.");
  return body;
}

function showStatus(message = "", type = "") {
  elements.status.textContent = message;
  elements.status.className = `status${type ? ` ${type}` : ""}`;
}

function teamsById() {
  return new Map((state.bootstrap?.teams || []).map((team) => [team.id, team]));
}

function futureEvents() {
  const events = state.bootstrap?.events || [];
  const upcoming = events.filter((event) => !event.finished);
  return upcoming.length ? upcoming : events.slice(-8);
}

function completedGameweeks() {
  return (state.bootstrap?.events || []).filter((event) => event.finished).length;
}

function nextGameweek() {
  return futureEvents()[0]?.id;
}

function fixtureInfo(teamId, gameweek) {
  return fixtureInfoForTeam(state.fixtures, teamsById(), teamId, gameweek);
}

function predictionFor(player, gameweek) {
  return predictPlayerPoints({
    player,
    fixtures: state.fixtures,
    gameweek,
    completedGameweeks: completedGameweeks(),
    isNextGameweek: gameweek === nextGameweek(),
  });
}

function selectedWeeks() {
  return futureEvents().filter((event) => state.selectedGameweeks.has(event.id));
}

function syncPositionButtons() {
  const allSelected = state.selectedPositions.size === 4;
  elements.positionFilters.querySelectorAll("[data-position]").forEach((button) => {
    const value = button.dataset.position;
    const active = value === "all" ? allSelected : state.selectedPositions.has(Number(value));
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function choosePosition(value) {
  if (value === "all") {
    state.selectedPositions = new Set([1, 2, 3, 4]);
  } else {
    const position = Number(value);
    if (state.selectedPositions.has(position)) state.selectedPositions.delete(position);
    else state.selectedPositions.add(position);
  }
  syncPositionButtons();
  renderTable();
}

function renderGameweeks() {
  elements.gameweeks.replaceChildren();
  futureEvents().forEach((event) => {
    const selected = state.selectedGameweeks.has(event.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `predictor-gameweek${selected ? " active" : ""}`;
    button.setAttribute("aria-pressed", String(selected));

    const week = document.createElement("strong");
    week.textContent = `GW ${event.id}`;
    const date = document.createElement("span");
    date.textContent = event.deadline_time
      ? new Date(event.deadline_time).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : "TBC";
    button.append(week, date);
    button.addEventListener("click", () => {
      if (state.selectedGameweeks.has(event.id)) state.selectedGameweeks.delete(event.id);
      else state.selectedGameweeks.add(event.id);
      renderGameweeks();
      renderTable();
    });
    elements.gameweeks.append(button);
  });
}

function makeHeader(weeks) {
  const row = document.createElement("tr");
  const player = document.createElement("th");
  player.className = "player-column";
  player.scope = "col";
  player.textContent = "Player";
  row.append(player);

  const total = document.createElement("th");
  total.className = "total-column";
  total.scope = "col";
  total.innerHTML = "Selected<br />total";
  row.append(total);

  weeks.forEach((event) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    const week = document.createElement("strong");
    week.textContent = `GW ${event.id}`;
    const date = document.createElement("span");
    date.textContent = event.deadline_time
      ? new Date(event.deadline_time).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : "TBC";
    cell.append(week, date);
    row.append(cell);
  });
  elements.head.replaceChildren(row);
}

function makeFixtureCell(player, gameweek) {
  const fixture = fixtureInfo(player.team, gameweek);
  const predicted = predictionFor(player, gameweek);
  const cell = document.createElement("td");
  const tile = document.createElement("div");
  tile.className = `prediction-fixture fdr-${fixture.difficulty}${fixture.blank ? " is-blank" : ""}`;

  const opponent = document.createElement("span");
  opponent.textContent = fixture.label;
  const points = document.createElement("strong");
  points.textContent = predicted.toFixed(1);
  const label = document.createElement("small");
  label.textContent = "predicted pts";

  tile.append(opponent, points, label);
  cell.append(tile);
  return cell;
}

function renderTable() {
  const weeks = selectedWeeks();
  makeHeader(weeks);

  const players = rankPlayersForWeeks(
    state.bootstrap?.elements || [],
    state.selectedPositions,
    weeks.map((event) => event.id),
    predictionFor
  );

  elements.body.replaceChildren();
  if (!state.selectedPositions.size || !weeks.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "prediction-empty";
    cell.colSpan = Math.max(2, weeks.length + 2);
    cell.textContent = !state.selectedPositions.size
      ? "Select at least one position to view players."
      : "Select at least one gameweek to calculate predictions.";
    row.append(cell);
    elements.body.append(row);
  } else {
    const teams = teamsById();
    players.forEach(({ player, total }) => {
      const team = teams.get(player.team);
      const row = document.createElement("tr");

      const identity = document.createElement("td");
      identity.className = "player-column";
      const copy = document.createElement("div");
      copy.className = "prediction-player";
      const marker = document.createElement("span");
      marker.className = "position-marker";
      marker.textContent = positionLabels[player.element_type];
      const name = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = player.web_name;
      strong.title = `${player.first_name || ""} ${player.second_name || ""}`.trim();
      const meta = document.createElement("span");
      meta.textContent = `${team?.short_name || "—"} · £${(Number(player.now_cost || 0) / 10).toFixed(1)}m`;
      name.append(strong, meta);
      copy.append(marker, name);
      identity.append(copy);
      row.append(identity);

      const totalCell = document.createElement("td");
      totalCell.className = "total-column prediction-total";
      const totalValue = document.createElement("strong");
      totalValue.textContent = total.toFixed(1);
      const totalLabel = document.createElement("span");
      totalLabel.textContent = `${weeks.length} GW${weeks.length === 1 ? "" : "s"}`;
      totalCell.append(totalValue, totalLabel);
      row.append(totalCell);

      weeks.forEach((event) => row.append(makeFixtureCell(player, event.id)));
      elements.body.append(row);
    });
  }

  elements.summary.textContent = `${players.length} player${players.length === 1 ? "" : "s"} ranked by predicted points across ${weeks.length} selected gameweek${weeks.length === 1 ? "" : "s"}.`;
}

async function loadPredictor() {
  try {
    const [bootstrap, fixtures] = await Promise.all([apiGet("/api/bootstrap"), apiGet("/api/fixtures")]);
    state.bootstrap = bootstrap;
    state.fixtures = fixtures;
    futureEvents().slice(0, 5).forEach((event) => state.selectedGameweeks.add(event.id));
    elements.method.textContent = predictionMethodology;
    elements.workspace.hidden = false;
    showStatus("Live player and fixture data loaded.", "success");
    syncPositionButtons();
    renderGameweeks();
    renderTable();
  } catch (error) {
    showStatus(error.message || "The points predictor could not load.", "error");
  }
}

elements.positionFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-position]");
  if (button) choosePosition(button.dataset.position);
});

loadPredictor();
