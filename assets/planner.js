const API_BASE = String(window.FPLVERSE_CONFIG?.apiBaseUrl || "").replace(/\/$/, "");

const elements = {
  form: document.querySelector("#plannerEntryForm"),
  entryId: document.querySelector("#plannerEntryId"),
  loadButton: document.querySelector("#loadSquadButton"),
  status: document.querySelector("#plannerStatus"),
  workspace: document.querySelector("#plannerWorkspace"),
  avatar: document.querySelector("#plannerAvatar"),
  teamName: document.querySelector("#plannerTeamName"),
  managerName: document.querySelector("#plannerManagerName"),
  sourceGameweek: document.querySelector("#sourceGameweek"),
  bank: document.querySelector("#plannerBank"),
  transferCount: document.querySelector("#transferCount"),
  tabs: document.querySelector("#gameweekTabs"),
  pitch: document.querySelector("#pitch"),
  bench: document.querySelector("#bench"),
  pitchSubtitle: document.querySelector("#pitchSubtitle"),
  transferTitle: document.querySelector("#transferTitle"),
  transferHint: document.querySelector("#transferHint"),
  transferTools: document.querySelector("#transferTools"),
  search: document.querySelector("#playerSearch"),
  sort: document.querySelector("#playerSort"),
  replacements: document.querySelector("#replacementList"),
  reset: document.querySelector("#resetDraft"),
  draftState: document.querySelector("#draftState"),
};

const state = {
  entryId: null,
  profile: null,
  bootstrap: null,
  fixtures: [],
  picks: null,
  sourceGw: null,
  activeGw: null,
  original: [],
  squad: [],
  selectedSlot: null,
};

const positionLabels = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };

const clubPalettes = {
  ARS: ["#ef233c", "#063672", "#ffffff"],
  AVL: ["#670e36", "#95bfe5", "#ffffff"],
  BOU: ["#d71920", "#151515", "#ffffff"],
  BRE: ["#e30613", "#ffffff", "#ffffff"],
  BHA: ["#0057b8", "#ffffff", "#ffffff"],
  CHE: ["#034694", "#dba111", "#ffffff"],
  COV: ["#69b3e7", "#17365d", "#10243c"],
  CRY: ["#1b458f", "#c4122e", "#ffffff"],
  EVE: ["#003399", "#ffffff", "#ffffff"],
  FUL: ["#171717", "#cc0000", "#ffffff"],
  HUL: ["#f5a12d", "#171717", "#171717"],
  IPS: ["#0044aa", "#ffffff", "#ffffff"],
  LEE: ["#ffcd00", "#1d428a", "#172b4d"],
  LIV: ["#c8102e", "#00b2a9", "#ffffff"],
  MCI: ["#6cabdd", "#1c2c5b", "#10243c"],
  MUN: ["#da291c", "#fbe122", "#ffffff"],
  NEW: ["#202020", "#ffffff", "#ffffff"],
  NFO: ["#dd0000", "#ffffff", "#ffffff"],
  TOT: ["#132257", "#ffffff", "#ffffff"],
  SUN: ["#eb172b", "#171717", "#ffffff"],
};

function clubPalette(team) {
  return clubPalettes[team?.short_name] || ["#6d5bd0", "#67d6ff", "#ffffff"];
}

function applyClubPalette(node, team) {
  const [primary, secondary, text] = clubPalette(team);
  node.style.setProperty("--club-primary", primary);
  node.style.setProperty("--club-secondary", secondary);
  node.style.setProperty("--club-text", text);
}

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

function initials(profile) {
  return [profile.player_first_name, profile.player_last_name]
    .filter(Boolean)
    .map((name) => name[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "FV";
}

function playersById() {
  return new Map((state.bootstrap?.elements || []).map((player) => [player.id, player]));
}

function teamsById() {
  return new Map((state.bootstrap?.teams || []).map((team) => [team.id, team]));
}

function playerFor(slot) {
  return playersById().get(slot.element);
}

function formatMoney(tenths) {
  return `£${(Number(tenths || 0) / 10).toFixed(1)}m`;
}

function draftKey() {
  return `fplverse-planner-draft-${state.entryId}`;
}

function currentDraftBank() {
  const map = playersById();
  const originalCost = state.original.reduce((sum, slot) => sum + Number(map.get(slot.element)?.now_cost || 0), 0);
  const draftCost = state.squad.reduce((sum, slot) => sum + Number(map.get(slot.element)?.now_cost || 0), 0);
  return Number(state.picks?.entry_history?.bank || 0) + originalCost - draftCost;
}

function changeCount() {
  return state.squad.reduce((count, slot, index) => count + (slot.element !== state.original[index]?.element ? 1 : 0), 0);
}

function saveDraft() {
  localStorage.setItem(draftKey(), JSON.stringify({ sourceGw: state.sourceGw, squad: state.squad }));
}

function restoreDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey()) || "null");
    const validIds = playersById();
    if (
      saved?.sourceGw === state.sourceGw &&
      Array.isArray(saved.squad) &&
      saved.squad.length === 15 &&
      saved.squad.every((slot) => validIds.has(slot.element))
    ) {
      state.squad = saved.squad.map((slot) => ({ ...slot }));
    }
  } catch {
    localStorage.removeItem(draftKey());
  }
}

async function latestPublishedPicks(profile) {
  const start = Math.min(38, Math.max(1, Number(profile.current_event || profile.entered_events?.at(-1) || 1)));
  for (let gw = start; gw >= 1; gw -= 1) {
    try {
      return { gw, data: await apiGet(`/api/entry/${profile.id}/event/${gw}/picks`) };
    } catch (error) {
      if (gw === 1) throw error;
    }
  }
  throw new Error("No published squad is available for this Entry ID yet.");
}

function futureEvents() {
  const events = state.bootstrap?.events || [];
  let future = events.filter((event) => event.id > state.sourceGw).slice(0, 6);
  if (!future.length) future = events.filter((event) => event.id >= state.sourceGw).slice(-6);
  return future;
}

function fixtureFor(teamId, gameweek = state.activeGw) {
  const teamMap = teamsById();
  const matches = state.fixtures.filter((fixture) => fixture.event === gameweek && (fixture.team_h === teamId || fixture.team_a === teamId));
  if (!matches.length) return { label: "Blank", difficulty: 3, sortDifficulty: 6 };
  const labels = matches.map((fixture) => {
    const home = fixture.team_h === teamId;
    const opponent = teamMap.get(home ? fixture.team_a : fixture.team_h)?.short_name || "TBC";
    const difficulty = home ? fixture.team_h_difficulty : fixture.team_a_difficulty;
    return { label: `${opponent} (${home ? "H" : "A"})`, difficulty };
  });
  return {
    label: labels.map((item) => item.label).join(" + "),
    difficulty: Math.max(1, Math.min(5, Math.round(labels.reduce((sum, item) => sum + item.difficulty, 0) / labels.length))),
    sortDifficulty: labels.reduce((sum, item) => sum + item.difficulty, 0) / labels.length,
  };
}

function cardFor(slot, slotIndex) {
  const player = playerFor(slot);
  const team = teamsById().get(player.team);
  const fixture = fixtureFor(player.team);
  const card = document.createElement("article");
  card.className = "player-card";
  applyClubPalette(card, team);

  const position = document.createElement("span");
  position.className = "player-position";
  position.textContent = positionLabels[player.element_type];
  card.append(position);

  if (slot.is_captain || slot.is_vice_captain) {
    const badge = document.createElement("span");
    badge.className = "captain-badge";
    badge.textContent = slot.is_captain ? "C" : "V";
    badge.title = slot.is_captain ? "Captain" : "Vice-captain";
    card.append(badge);
  }

  const name = document.createElement("strong");
  name.className = "player-name";
  name.textContent = player.web_name;
  name.title = `${player.first_name} ${player.second_name}`;
  card.append(name);

  const meta = document.createElement("span");
  meta.className = "player-meta";
  const club = document.createElement("b");
  club.className = "club-chip";
  club.textContent = team?.short_name || "—";
  const price = document.createElement("span");
  price.className = "player-price";
  price.textContent = formatMoney(player.now_cost);
  meta.append(club, price);
  card.append(meta);

  const fixtureNode = document.createElement("i");
  fixtureNode.className = `player-fixture fdr-${fixture.difficulty}`;
  fixtureNode.textContent = fixture.label;
  card.append(fixtureNode);

  const remove = document.createElement("button");
  remove.className = "player-remove";
  remove.type = "button";
  remove.textContent = "Find replacement";
  remove.addEventListener("click", () => selectSlot(slotIndex));
  card.append(remove);
  return card;
}

function renderSquad() {
  elements.pitch.replaceChildren();
  elements.bench.replaceChildren();
  const starters = state.squad.map((slot, index) => ({ slot, index })).filter(({ slot }) => slot.position <= 11);
  const bench = state.squad.map((slot, index) => ({ slot, index })).filter(({ slot }) => slot.position > 11);

  [1, 2, 3, 4].forEach((type) => {
    const row = document.createElement("div");
    row.className = "position-row";
    starters.filter(({ slot }) => playerFor(slot)?.element_type === type).forEach(({ slot, index }) => row.append(cardFor(slot, index)));
    if (row.children.length) elements.pitch.append(row);
  });
  bench.forEach(({ slot, index }) => elements.bench.append(cardFor(slot, index)));
}

function renderTabs() {
  elements.tabs.replaceChildren();
  const events = futureEvents();
  if (!state.activeGw || !events.some((event) => event.id === state.activeGw)) state.activeGw = events[0]?.id || state.sourceGw;
  events.forEach((event) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `gameweek-tab${event.id === state.activeGw ? " active" : ""}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(event.id === state.activeGw));
    const date = event.deadline_time ? new Date(event.deadline_time).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "TBC";
    button.innerHTML = `GW ${event.id}<span>${date}</span>`;
    button.addEventListener("click", () => {
      state.activeGw = event.id;
      renderTabs();
      renderSquad();
      renderReplacements();
    });
    elements.tabs.append(button);
  });
}

function renderSummary() {
  const changes = changeCount();
  elements.bank.textContent = formatMoney(currentDraftBank());
  elements.transferCount.textContent = String(changes);
  elements.draftState.textContent = changes ? `${changes} draft change${changes === 1 ? "" : "s"} saved` : "Live squad loaded";
  elements.reset.disabled = changes === 0;
}

function selectSlot(slotIndex) {
  state.selectedSlot = slotIndex;
  const player = playerFor(state.squad[slotIndex]);
  elements.transferTitle.textContent = `Replace ${player.web_name}`;
  elements.transferHint.textContent = `${positionLabels[player.element_type]} · ${formatMoney(player.now_cost)} at current price`;
  elements.transferTools.hidden = false;
  elements.search.value = "";
  renderReplacements();
  if (window.innerWidth < 1120) elements.transferTitle.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clubCount(teamId) {
  return state.squad.reduce((count, slot) => count + (playerFor(slot)?.team === teamId ? 1 : 0), 0);
}

function candidateStatus(candidate, outgoing) {
  const bankAfter = currentDraftBank() + Number(outgoing.now_cost) - Number(candidate.now_cost);
  if (bankAfter < 0) return "Over budget";
  if (candidate.team !== outgoing.team && clubCount(candidate.team) >= 3) return "Club limit";
  return "";
}

function renderReplacements() {
  if (state.selectedSlot === null) return;
  const outgoing = playerFor(state.squad[state.selectedSlot]);
  const selectedIds = new Set(state.squad.map((slot) => slot.element));
  const teamMap = teamsById();
  const query = elements.search.value.trim().toLowerCase();
  const sort = elements.sort.value;

  let candidates = (state.bootstrap?.elements || []).filter((player) => {
    if (player.element_type !== outgoing.element_type || selectedIds.has(player.id)) return false;
    const team = teamMap.get(player.team);
    return !query || `${player.web_name} ${player.first_name} ${player.second_name} ${team?.name || ""}`.toLowerCase().includes(query);
  });

  candidates.sort((a, b) => {
    if (sort === "price") return b.now_cost - a.now_cost;
    if (sort === "points") return b.total_points - a.total_points;
    if (sort === "fixture") return fixtureFor(a.team).sortDifficulty - fixtureFor(b.team).sortDifficulty;
    return Number(b.form || 0) - Number(a.form || 0);
  });

  elements.replacements.replaceChildren();
  candidates.slice(0, 80).forEach((candidate) => {
    const fixture = fixtureFor(candidate.team);
    const reason = candidateStatus(candidate, outgoing);
    const row = document.createElement("div");
    row.className = "replacement";
    applyClubPalette(row, teamMap.get(candidate.team));
    const copy = document.createElement("div");
    copy.className = "replacement-copy";
    const name = document.createElement("strong");
    const swatch = document.createElement("i");
    swatch.className = "club-swatch";
    const nameText = document.createElement("span");
    nameText.textContent = candidate.web_name;
    name.append(swatch, nameText);
    const detail = document.createElement("span");
    detail.textContent = `${teamMap.get(candidate.team)?.short_name || "—"} · ${fixture.label} · Form ${candidate.form || "0.0"}`;
    copy.append(name, detail);
    const price = document.createElement("span");
    price.className = "replacement-price";
    price.textContent = formatMoney(candidate.now_cost);
    const choose = document.createElement("button");
    choose.type = "button";
    choose.textContent = reason || "Add";
    choose.disabled = Boolean(reason);
    choose.addEventListener("click", () => replacePlayer(candidate.id));
    row.append(copy, price, choose);
    elements.replacements.append(row);
  });

  if (!elements.replacements.children.length) {
    const empty = document.createElement("div");
    empty.className = "transfer-empty";
    empty.textContent = "No matching replacements.";
    elements.replacements.append(empty);
  }
}

function replacePlayer(elementId) {
  state.squad[state.selectedSlot] = { ...state.squad[state.selectedSlot], element: elementId };
  saveDraft();
  renderSquad();
  renderSummary();
  const player = playersById().get(elementId);
  elements.transferTitle.textContent = `${player.web_name} added`;
  elements.transferHint.textContent = "Choose another squad player to keep planning.";
  state.selectedSlot = null;
  elements.transferTools.hidden = true;
  elements.replacements.innerHTML = '<div class="transfer-empty"><strong>Draft updated</strong><span>Your change is saved on this device.</span></div>';
}

function resetDraft() {
  state.squad = state.original.map((slot) => ({ ...slot }));
  state.selectedSlot = null;
  localStorage.removeItem(draftKey());
  elements.transferTools.hidden = true;
  elements.transferTitle.textContent = "Choose a player";
  elements.transferHint.textContent = "Select Remove on a squad card to see replacements.";
  elements.replacements.innerHTML = '<div class="transfer-empty"><strong>No player selected</strong><span>Your current squad stays intact until you confirm a replacement.</span></div>';
  renderSquad();
  renderSummary();
}

async function loadPlanner(entryId) {
  showStatus("Loading the latest published squad and fixture calendar…");
  elements.loadButton.disabled = true;
  elements.workspace.hidden = true;
  try {
    const [profile, bootstrap, fixtures] = await Promise.all([
      apiGet(`/api/entry/${entryId}`),
      apiGet("/api/bootstrap"),
      apiGet("/api/fixtures"),
    ]);
    const published = await latestPublishedPicks(profile);
    if (!Array.isArray(published.data.picks) || published.data.picks.length !== 15) throw new Error("The published squad is incomplete.");

    state.entryId = Number(profile.id);
    state.profile = profile;
    state.bootstrap = bootstrap;
    state.fixtures = fixtures;
    state.picks = published.data;
    state.sourceGw = published.gw;
    state.original = published.data.picks.map((slot) => ({ ...slot }));
    state.squad = state.original.map((slot) => ({ ...slot }));
    state.selectedSlot = null;
    restoreDraft();

    localStorage.setItem("fplverse-entry-id", String(state.entryId));
    history.replaceState(null, "", `planner.html?entry=${state.entryId}`);
    elements.entryId.value = String(state.entryId);
    elements.avatar.textContent = initials(profile);
    elements.teamName.textContent = profile.name || `Entry ${state.entryId}`;
    elements.managerName.textContent = `${profile.player_first_name || ""} ${profile.player_last_name || ""}`.trim();
    elements.sourceGameweek.textContent = `GW ${state.sourceGw}`;
    elements.pitchSubtitle.textContent = `Fixtures shown for the selected future gameweek. Source squad locked at the GW ${state.sourceGw} deadline.`;
    elements.workspace.hidden = false;
    renderTabs();
    renderSquad();
    renderSummary();
    showStatus(`Squad loaded. Future changes here are private planning only.`, "success");
  } catch (error) {
    showStatus(error.message || "The planner could not load this squad.", "error");
  } finally {
    elements.loadButton.disabled = false;
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const entryId = Number(elements.entryId.value);
  if (!Number.isInteger(entryId) || entryId < 1) return showStatus("Enter a valid FPL Entry ID.", "error");
  loadPlanner(entryId);
});

elements.search.addEventListener("input", renderReplacements);
elements.sort.addEventListener("change", renderReplacements);
elements.reset.addEventListener("click", resetDraft);

const params = new URLSearchParams(location.search);
const savedEntry = params.get("entry") || localStorage.getItem("fplverse-entry-id") || "";
if (/^\d{1,8}$/.test(savedEntry)) elements.entryId.value = savedEntry;
