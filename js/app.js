const DATA_URL = "data/episodes.json";
const STATUS_LABELS = {
  confirmed: "Confirmed",
  scheduled: "Scheduled",
  aired: "Aired",
  announced: "Announced · provisional",
  unconfirmed: "Unconfirmed",
  rumored: "Rumored",
  postponed: "Postponed",
  canceled: "Canceled"
};
const PROVISIONAL_STATUSES = new Set(["announced", "unconfirmed", "rumored"]);
const SCHEDULE_STATUSES = new Set(["confirmed", "scheduled", "aired", ...PROVISIONAL_STATUSES]);
const FALLBACK_ZONES = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Vancouver", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Asia/Dubai", "Asia/Kolkata", "Asia/Tokyo", "Asia/Seoul", "Asia/Shanghai", "Australia/Sydney", "Pacific/Auckland"];

const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const state = {
  episodes: [], changeLog: [], month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: dateKeyInZone(new Date(), localZone), search: "", channel: "", dub: "", status: "",
  includeUnconfirmed: false, timeZone: localZone, favoritesOnly: false,
  favoriteChannels: [], favoriteDubs: [], region: "", watchedEpisodes: [], watchlistEpisodes: [], listView: false, reminderEnabled: false, notifiedKeys: new Set()
};
const el = {};
document.addEventListener("DOMContentLoaded", init);

async function init() {
  const ids = [
    "timezone-label", "search-input", "clear-search", "channel-filter", "dub-filter", "region-filter", "status-filter", "reset-filters",
    "include-unconfirmed", "month-title", "month-summary", "calendar-grid", "prev-month", "next-month", "today-button",
    "day-title", "day-summary", "schedule-content", "search-results", "result-count", "results-content", "load-error", "back-to-calendar",
    "next-airing-content", "timezone-select", "episode-jump", "episode-jump-button", "favorite-channels", "favorite-dubs", "favorites-only",
    "save-preferences", "settings-message", "validation-results", "validate-data", "export-ics", "export-csv", "enable-reminders",
    "share-view", "toggle-list-view", "list-view", "history-content", "watchlist-content", "watchlist-count", "verification-content"
  ];
  ids.forEach(id => el[id] = document.getElementById(id));
  state.timeZone = localZone;
  state.selectedDate = dateKeyInZone(new Date(), state.timeZone);
  state.month = monthFromKey(state.selectedDate);
  populateTimeZones();
  loadPreferences();
  applyUrlState();
  updateTimezoneLabel();
  bindEvents();

  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${DATA_URL} (${response.status}).`);
    const data = await response.json();
    state.episodes = Array.isArray(data.episodes) ? data.episodes : [];
    state.changeLog = Array.isArray(data.changeLog) ? data.changeLog : [];
    populateFilters();
    populateFavoriteChoices();
    renderAll();
    if (!state.episodes.length) {
      el["settings-message"].textContent = "The schedule data is currently empty. Add verified entries to data/episodes.json; no dates are invented by this app.";
    }
  } catch (error) {
    el["load-error"].hidden = false;
    el["load-error"].textContent = `${error.message} If you opened index.html directly, use GitHub Pages or run a local web server.`;
    renderCalendar(); renderSelectedDay(); renderNextAiring(); renderHistory();
  }
  window.setInterval(() => { checkReminder(); renderNextAiring(); }, 1000);
}

function bindEvents() {
  el["prev-month"].addEventListener("click", () => changeMonth(-1));
  el["next-month"].addEventListener("click", () => changeMonth(1));
  el["today-button"].addEventListener("click", () => {
    state.selectedDate = dateKeyInZone(new Date(), state.timeZone);
    state.month = monthFromKey(state.selectedDate); renderAll(); updateUrlState();
  });
  el["search-input"].addEventListener("input", event => {
    state.search = event.target.value.trim().toLocaleLowerCase();
    el["clear-search"].hidden = !event.target.value; renderAll(); updateUrlState();
  });
  el["clear-search"].addEventListener("click", () => {
    el["search-input"].value = ""; state.search = ""; el["clear-search"].hidden = true; renderAll(); updateUrlState(); el["search-input"].focus();
  });
  el["channel-filter"].addEventListener("change", event => { state.channel = event.target.value; renderAll(); updateUrlState(); });
  el["dub-filter"].addEventListener("change", event => { state.dub = event.target.value; renderAll(); updateUrlState(); });
  el["region-filter"].addEventListener("change", event => { state.region = event.target.value; renderAll(); updateUrlState(); });
  el["status-filter"].addEventListener("change", event => { state.status = event.target.value; renderAll(); updateUrlState(); });
  el["include-unconfirmed"].addEventListener("change", event => {
    state.includeUnconfirmed = event.target.checked; populateFilters(); renderAll(); updateUrlState();
  });
  el["reset-filters"].addEventListener("click", () => {
    state.search = ""; state.channel = ""; state.dub = ""; state.region = ""; state.status = "";
    el["search-input"].value = ""; el["channel-filter"].value = ""; el["dub-filter"].value = ""; el["region-filter"].value = ""; el["status-filter"].value = "";
    el["clear-search"].hidden = true; renderAll(); updateUrlState();
  });
  el["back-to-calendar"].addEventListener("click", () => document.querySelector(".calendar-panel").scrollIntoView({ behavior: "smooth", block: "start" }));
  el["timezone-select"].addEventListener("change", event => {
    state.timeZone = event.target.value === "local" ? localZone : event.target.value;
    state.selectedDate = dateKeyInZone(new Date(), state.timeZone); state.month = monthFromKey(state.selectedDate);
    updateTimezoneLabel(); renderAll(); updateUrlState();
  });
  el["episode-jump-button"].addEventListener("click", jumpToEpisode);
  el["episode-jump"].addEventListener("keydown", event => { if (event.key === "Enter") jumpToEpisode(); });
  el["favorites-only"].addEventListener("change", event => { state.favoritesOnly = event.target.checked; renderAll(); updateUrlState(); });
  el["save-preferences"].addEventListener("click", savePreferences);
  el["validate-data"].addEventListener("click", validateData);
  el["export-ics"].addEventListener("click", exportCalendar);
  el["export-csv"].addEventListener("click", exportCsv);
  el["enable-reminders"].addEventListener("click", enableReminders);
  el["share-view"].addEventListener("click", shareView);
  el["toggle-list-view"].addEventListener("click", () => {
    state.listView = !state.listView; el["list-view"].hidden = !state.listView; el["calendar-grid"].hidden = state.listView;
    el["toggle-list-view"].textContent = state.listView ? "Switch to calendar view" : "Switch to list view";
    renderCalendar();
  });
}

function localDateKey(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function pad(value) { return String(value).padStart(2, "0"); }
function dateKeyInZone(date, zone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function monthFromKey(key) { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1); }
function keyPartsDate(key) { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); }
function parseTimestamp(value) {
  if (typeof value !== "string" || !/Z$/i.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function normalizeLanguages(airing) {
  let raw = airing.dub ?? airing.dubs ?? airing.languages ?? airing.language ?? [];
  if (!Array.isArray(raw)) raw = [raw];
  const seen = new Set();
  return raw.map(value => String(value).trim()).filter(value => {
    if (!value) return false;
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function normalizeRegions(airing) {
  let raw = airing.regions ?? airing.region ?? airing.country ?? [];
  if (!Array.isArray(raw)) raw = [raw];
  return uniqueSorted(raw.map(value => String(value).trim()).filter(Boolean));
}
function normalizeStatus(airing) {
  if (typeof airing.status === "string" && airing.status.trim()) return airing.status.trim().toLowerCase();
  if (airing.confirmed === true) return "confirmed";
  return "unconfirmed";
}
function rawAirings() {
  const result = [];
  for (const episode of state.episodes) {
    if (!episode || typeof episode !== "object") continue;
    for (const airing of (Array.isArray(episode.airings) ? episode.airings : [])) {
      if (!airing || typeof airing !== "object") continue;
      const status = normalizeStatus(airing);
      const date = parseTimestamp(airing.firstAirUtc);
      if (!date || !SCHEDULE_STATUSES.has(status)) continue;
      const languages = normalizeLanguages(airing);
      const regions = normalizeRegions(airing);
      result.push({ ...airing, episode, status, languages, regions, date, localDate: dateKeyInZone(date, state.timeZone) });
    }
  }
  return result;
}
function allAirings() {
  const seen = new Set();
  return rawAirings().filter(item => {
    const key = [item.episode.id ?? item.episode.number, item.channel || "", item.date.toISOString(), [...item.languages].sort().join("|")].join("::");
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a, b) => a.date - b.date || String(a.episode.id ?? a.episode.number).localeCompare(String(b.episode.id ?? b.episode.number), undefined, { numeric: true }));
}
function isConfirmed(item) { return item.status === "confirmed" || item.status === "scheduled" || item.status === "aired"; }
function visibleAirings({ includeSearch = true, confirmedOnly = false } = {}) {
  const query = includeSearch ? state.search : "";
  return allAirings().filter(item => {
    if (confirmedOnly && !isConfirmed(item)) return false;
    if (!isConfirmed(item) && !(state.includeUnconfirmed && PROVISIONAL_STATUSES.has(item.status))) return false;
    if (state.channel && item.channel !== state.channel) return false;
    if (state.dub && !item.languages.some(language => language.toLocaleLowerCase() === state.dub.toLocaleLowerCase())) return false;
    if (state.region && !item.regions.some(region => region.toLocaleLowerCase() === state.region.toLocaleLowerCase())) return false;
    if (state.status && item.status !== state.status) return false;
    if (state.favoritesOnly) {
      const channelMatch = state.favoriteChannels.length && state.favoriteChannels.includes(item.channel);
      const dubMatch = state.favoriteDubs.length && item.languages.some(language => state.favoriteDubs.includes(language));
      if (!channelMatch && !dubMatch) return false;
    }
    if (!query) return true;
    const haystack = [item.episode.id, item.episode.number, item.episode.title, item.episode.titleOriginal, item.channel, ...item.languages, ...item.regions, item.status, item.source, item.sourcePublisher, item.evidenceType]
      .filter(value => value !== undefined && value !== null).join(" ").toLocaleLowerCase();
    return haystack.includes(query);
  });
}
function populateFilters() {
  const all = allAirings();
  const visible = all.filter(item => isConfirmed(item) || (state.includeUnconfirmed && PROVISIONAL_STATUSES.has(item.status)));
  const channels = uniqueSorted(visible.map(a => a.channel));
  const languages = uniqueSorted(visible.flatMap(a => a.languages));
  const statuses = uniqueSorted(visible.map(a => a.status));
  const regions = uniqueSorted(visible.flatMap(a => a.regions));
  if (state.channel && !channels.includes(state.channel)) state.channel = "";
  if (state.dub && !languages.includes(state.dub)) state.dub = "";
  if (state.region && !regions.includes(state.region)) state.region = "";
  if (state.status && !statuses.includes(state.status)) state.status = "";
  fillSelect(el["channel-filter"], channels, "All channels");
  fillSelect(el["dub-filter"], languages, "All dubs");
  fillSelect(el["region-filter"], regions, "All regions");
  fillSelect(el["status-filter"], statuses.map(s => ({ value: s, label: statusLabel(s) })), "All visible statuses", true);
  el["channel-filter"].value = state.channel;
  el["dub-filter"].value = state.dub;
  el["region-filter"].value = state.region;
  el["status-filter"].value = state.status;
}
function uniqueSorted(values) { const unique = new Map(); values.filter(Boolean).forEach(value => { const label = String(value).trim(); if (label && !unique.has(label.toLocaleLowerCase())) unique.set(label.toLocaleLowerCase(), label); }); return [...unique.values()].sort((a, b) => a.localeCompare(b)); }
function fillSelect(select, values, label, objectValues = false) {
  const oldValue = select.value;
  select.replaceChildren(new Option(label, ""));
  values.forEach(item => {
    const value = objectValues ? item.value : item;
    const text = objectValues ? item.label : item;
    select.add(new Option(text, value));
  });
  if (values.some(item => (objectValues ? item.value : item) === oldValue)) select.value = oldValue;
}
function populateFavoriteChoices() {
  const all = allAirings();
  fillMultiSelect(el["favorite-channels"], uniqueSorted(all.map(a => a.channel)), state.favoriteChannels);
  fillMultiSelect(el["favorite-dubs"], uniqueSorted(all.flatMap(a => a.languages)), state.favoriteDubs);
}
function fillMultiSelect(select, values, selected) {
  select.replaceChildren();
  values.forEach(value => { const option = new Option(value, value); option.selected = selected.includes(value); select.add(option); });
}
function renderAll() { renderCalendar(); renderSelectedDay(); renderSearch(); renderNextAiring(); renderHistory(); renderWatchlist(); renderVerification(); }
function changeMonth(delta) { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + delta, 1); renderCalendar(); updateUrlState(); }

function renderCalendar() {
  const year = state.month.getFullYear(), month = state.month.getMonth();
  const monthDate = new Date(Date.UTC(year, month, 1, 12));
  el["month-title"].textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(monthDate);
  const entries = visibleAirings();
  const monthEntries = entries.filter(item => item.localDate.slice(0, 7) === `${year}-${pad(month + 1)}`);
  const confirmedCount = monthEntries.filter(isConfirmed).length;
  const provisionalCount = monthEntries.length - confirmedCount;
  el["month-summary"].textContent = `${confirmedCount} confirmed${provisionalCount ? ` · ${provisionalCount} unconfirmed` : ""}`;
  const grid = el["calendar-grid"];
  while (grid.children.length > 7) grid.removeChild(grid.lastChild);
  const firstDayUtc = new Date(Date.UTC(year, month, 1, 12));
  const start = new Date(Date.UTC(year, month, 1 - firstDayUtc.getUTCDay(), 12));
  const todayKey = dateKeyInZone(new Date(), state.timeZone);
  const counts = new Map();
  for (const item of entries) {
    const current = counts.get(item.localDate) || { confirmed: 0, provisional: 0 };
    current[isConfirmed(item) ? "confirmed" : "provisional"]++;
    counts.set(item.localDate, current);
  }
  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getTime() + i * 86400000);
    const key = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    const inMonth = date.getUTCMonth() === month;
    const count = counts.get(key) || { confirmed: 0, provisional: 0 };
    const button = document.createElement("button"); button.type = "button"; button.className = "day-cell";
    if (!inMonth) button.classList.add("outside-month");
    if (key === state.selectedDate) button.classList.add("selected");
    if (key === todayKey) button.classList.add("today");
    const total = count.confirmed + count.provisional;
    button.setAttribute("aria-pressed", String(key === state.selectedDate));
    button.setAttribute("aria-label", `${formatDateKey(key)}${total ? `, ${count.confirmed} confirmed and ${count.provisional} unconfirmed airings` : ", no visible airings"}`);
    const number = document.createElement("span"); number.className = "day-number"; number.textContent = date.getUTCDate(); button.append(number);
    if (total) {
      const countEl = document.createElement("span"); countEl.className = "day-count";
      const dot = document.createElement("span"); dot.className = `count-dot ${count.provisional && !count.confirmed ? "provisional" : ""}`;
      const label = document.createElement("span"); label.className = "count-label"; label.textContent = `${total} ${total === 1 ? "airing" : "airs"}`;
      countEl.append(dot, label); button.append(countEl);
    }
    button.addEventListener("click", () => {
      state.selectedDate = key; if (!inMonth) state.month = monthFromKey(key); renderAll(); updateUrlState();
      if (window.matchMedia("(max-width: 640px)").matches) document.querySelector(".day-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    grid.append(button);
  }
  renderListView(entries);
}
function renderListView(entries) {
  const target = el["list-view"]; target.replaceChildren();
  const grouped = new Map();
  entries.forEach(item => { if (!grouped.has(item.localDate)) grouped.set(item.localDate, []); grouped.get(item.localDate).push(item); });
  if (!grouped.size) { target.append(makeEmptyState("No visible airings", "Try enabling unconfirmed airings or add entries to the schedule data.")); return; }
  [...grouped.keys()].sort().forEach(key => {
    const section = document.createElement("section"); section.className = "list-date-group";
    const button = document.createElement("button"); button.type = "button"; button.className = "list-date-button"; button.textContent = `${formatDateKey(key)} · ${grouped.get(key).length} airings`;
    button.addEventListener("click", () => { state.selectedDate = key; state.month = monthFromKey(key); renderAll(); updateUrlState(); el["day-panel"].scrollIntoView({ behavior: "smooth" }); });
    section.append(button);
    grouped.get(key).forEach(item => section.append(makeCompactAiring(item)));
    target.append(section);
  });
}
function renderSelectedDay() {
  el["day-title"].textContent = formatDateKey(state.selectedDate);
  const entries = visibleAirings().filter(item => item.localDate === state.selectedDate);
  const confirmed = entries.filter(isConfirmed).length, provisional = entries.length - confirmed;
  el["day-summary"].textContent = `${entries.length} visible airing${entries.length === 1 ? "" : "s"} · ${confirmed} confirmed${provisional ? ` · ${provisional} unconfirmed` : ""} · ${state.timeZone}`;
  el["schedule-content"].replaceChildren();
  if (!entries.length) {
    el["schedule-content"].append(makeEmptyState("No visible first airings on this date", state.includeUnconfirmed ? "No matching airings were found for this date. Try another date or adjust your filters." : "There are no matching confirmed airings for this date. Enable ‘Include unconfirmed airings’ to see provisional entries, if any.")); return;
  }
  const table = document.createElement("table"); table.className = "schedule-table";
  table.innerHTML = "<thead><tr><th>Time</th><th>Episode</th><th>Channel</th><th>Dub / language</th><th>Region</th><th>Status</th><th>Source</th><th>Watchlist</th></tr></thead>";
  const tbody = document.createElement("tbody");
  entries.forEach(item => {
    const tr = document.createElement("tr");
    tr.append(cell(makeTimeNode(item.date)), cell(makeEpisodeNode(item.episode)), cell(textNode(item.channel || "Not specified", "channel-name")), cell(makeLanguageNodes(item.languages)), cell(textNode(item.regions.join(" · ") || "Not specified", "muted")), cell(makeStatusNode(item.status)), cell(makeSourceNode(item.source, item.lastVerified)), cell(makeWatchButton(item.episode)));
    tbody.append(tr);
  });
  table.append(tbody); el["schedule-content"].append(table);
  const cards = document.createElement("div"); cards.className = "airing-cards"; entries.forEach(item => cards.append(makeAiringCard(item))); el["schedule-content"].append(cards);
}
function renderSearch() {
  const queryActive = Boolean(state.search || state.channel || state.dub || state.region || state.status || state.favoritesOnly);
  el["search-results"].hidden = !queryActive; if (!queryActive) return;
  const entries = visibleAirings(); el["result-count"].textContent = `${entries.length} ${entries.length === 1 ? "result" : "results"}`; el["results-content"].replaceChildren();
  if (!entries.length) { el["results-content"].append(makeEmptyState("No matching airings", "Try another episode number, title, channel, language, or status.")); return; }
  entries.forEach(item => {
    const row = document.createElement("div"); row.className = "search-result-item";
    const main = document.createElement("div"); main.className = "result-main"; main.append(makeEpisodeNode(item.episode));
    const meta = document.createElement("div"); meta.className = "result-meta"; meta.append(textNode(item.channel || "Channel not specified", "dub-pill"), makeLanguageNodes(item.languages), makeStatusNode(item.status)); main.append(meta);
    const dateButton = document.createElement("button"); dateButton.type = "button"; dateButton.className = "button button-secondary result-date"; dateButton.textContent = `${formatDate(item.date)} · ${formatTime(item.date)}`;
    dateButton.addEventListener("click", () => { state.selectedDate = item.localDate; state.month = monthFromKey(item.localDate); renderAll(); document.querySelector(".day-panel").scrollIntoView({ behavior: "smooth", block: "start" }); });
    row.append(main, makeWatchButton(item.episode), dateButton); el["results-content"].append(row);
  });
}
function renderNextAiring() {
  const target = el["next-airing-content"]; target.replaceChildren();
  const now = Date.now();
  const confirmed = allAirings().filter(item => isConfirmed(item));
  const next = confirmed.filter(item => item.date.getTime() >= now).sort((a, b) => a.date - b.date)[0];

  // Premiere means the earliest confirmed airing for that episode across every channel,
  // region, and dub. Later premieres of the same episode never restart this countdown.
  const firstPremieres = new Map();
  confirmed.forEach(item => {
    const key = episodeStableKey(item.episode);
    const previous = firstPremieres.get(key);
    if (!previous || item.date < previous.date) firstPremieres.set(key, item);
  });
  const premiereCountdown = [...firstPremieres.values()]
    .filter(item => item.date.getTime() > now && item.date.getTime() - now <= 24 * 60 * 60 * 1000)
    .sort((a, b) => a.date - b.date)[0];

  if (premiereCountdown) {
    target.classList.add("premiere-countdown-active");
    const item = premiereCountdown;
    const banner = document.createElement("article"); banner.className = "premiere-countdown-banner";
    const art = createEpisodeImage(item.episode, true);
    art.classList.add("premiere-countdown-art");
    const content = document.createElement("div"); content.className = "premiere-countdown-content";
    content.append(textNode("THE FIRST PREMIERE IS ALMOST HERE", "premiere-kicker"));
    const title = document.createElement("h3"); title.className = "premiere-title";
    title.textContent = `Episode ${item.episode.number ?? item.episode.id ?? "?"}${item.episode.title ? ` — ${item.episode.title}` : ""}`;
    content.append(title);
    if (item.episode.synopsis || item.episode.description) content.append(textNode(item.episode.synopsis || item.episode.description, "premiere-description"));
    content.append(textNode(`First premiere: ${item.channel || "Channel not specified"} · ${item.languages.join(" / ") || "Language not specified"} · ${item.regions.join(" / ") || "Region not specified"}`, "premiere-meta"));
    content.append(textNode(`${formatDate(item.date)} · ${formatTime(item.date)} (${state.timeZone})`, "premiere-date"));
    const countdown = document.createElement("div"); countdown.className = "premiere-countdown-clock"; countdown.setAttribute("role", "timer"); countdown.setAttribute("aria-live", "off");
    countdown.textContent = premiereCountdownText(item.date);
    content.append(countdown);
    const note = document.createElement("p"); note.className = "premiere-note"; note.textContent = "This countdown targets the episode’s earliest confirmed premiere—not later airings on other channels."; content.append(note);
    const actions = document.createElement("div"); actions.className = "premiere-actions";
    actions.append(makeWatchButton(item.episode));
    const jump = document.createElement("button"); jump.type = "button"; jump.className = "button button-secondary"; jump.textContent = "View premiere date";
    jump.addEventListener("click", () => { state.selectedDate = item.localDate; state.month = monthFromKey(item.localDate); renderAll(); updateUrlState(); document.querySelector(".day-panel").scrollIntoView({ behavior: "smooth", block: "start" }); });
    actions.append(jump); content.append(actions);
    banner.append(art, content); target.append(banner); return;
  }

  target.classList.remove("premiere-countdown-active");
  if (!next) { target.append(makeEmptyState("No upcoming confirmed airing in the data", "When a confirmed future first-air date is added to data/episodes.json, it will appear here.")); return; }
  const info = document.createElement("div"); info.className = "next-airing-info";
  const art = createEpisodeImage(next.episode, false); art.classList.add("next-airing-art"); info.append(art, makeEpisodeNode(next.episode, false));
  info.append(textNode(`${next.channel || "Channel not specified"} · ${next.languages.join(" / ") || "Language not specified"}`, "next-airing-meta"));
  info.append(textNode(`${formatDate(next.date)} · ${formatTime(next.date)} (${state.timeZone})`, "next-airing-date"));
  const countdown = document.createElement("span"); countdown.className = "countdown"; countdown.textContent = countdownText(next.date);
  const jump = document.createElement("button"); jump.type = "button"; jump.className = "button button-secondary"; jump.textContent = "View date";
  jump.addEventListener("click", () => { state.selectedDate = next.localDate; state.month = monthFromKey(next.localDate); renderAll(); updateUrlState(); document.querySelector(".day-panel").scrollIntoView({ behavior: "smooth", block: "start" }); });
  target.append(info, countdown, jump);
}
function premiereCountdownText(date) {
  const seconds = Math.max(0, Math.floor((date.getTime() - Date.now()) / 1000));
  const days = Math.floor(seconds / 86400), hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60), secs = seconds % 60;
  return `${days ? `${days}d ` : ""}${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
}
function createEpisodeImage(episode, premiere = false) {
  const wrap = document.createElement("div");
  const imagePath = premiere ? (episode.premiereImage || episode.countdownImage) : episode.image;
  const fallbackPath = !premiere && (episode.image || episode.poster);
  const path = safeImagePath(imagePath) || safeImagePath(fallbackPath);
  wrap.className = `episode-art${premiere ? " episode-art-premiere" : ""}${path ? " has-image" : " is-placeholder"}`;
  if (path) {
    const img = document.createElement("img"); img.src = path;
    img.alt = premiere ? `Special premiere artwork for episode ${episode.number ?? episode.id ?? "?"}` : `Artwork for episode ${episode.number ?? episode.id ?? "?"}`;
    img.loading = premiere ? "eager" : "lazy"; img.decoding = "async";
    img.addEventListener("error", () => { wrap.replaceChildren(textNode("MLB S7", "episode-art-placeholder-text")); wrap.classList.remove("has-image"); wrap.classList.add("is-placeholder"); }, { once: true });
    wrap.append(img);
  } else {
    wrap.append(textNode("MLB S7", "episode-art-placeholder-text"));
  }
  return wrap;
}
function safeImagePath(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const path = value.trim();
  if (/^(javascript|data|vbscript):/i.test(path)) return "";
  if (/^https?:\/\//i.test(path) || /^(\.\.\/|\.\/|\/|[\w-]+\/)/.test(path)) return path;
  return "";
}

function renderHistory() {
  const target = el["history-content"]; target.replaceChildren();
  const entries = [];
  state.changeLog.forEach(record => { if (record && typeof record === "object") entries.push({ ...record, episodeLabel: record.episodeId ? `Episode ${record.episodeId}` : "Schedule" }); });
  state.episodes.forEach(episode => {
    if (!episode || typeof episode !== "object") return;
    const airings = Array.isArray(episode.airings) ? episode.airings : [];
    airings.forEach(airing => {
      if (!airing || typeof airing !== "object") return;
      const records = Array.isArray(airing.history) ? airing.history.filter(record => record && typeof record === "object") : [];
      records.forEach(record => entries.push({ ...record, episodeLabel: `Episode ${episode.number ?? episode.id}`, channel: record.channel || airing.channel }));
      const status = normalizeStatus(airing);
      if (["postponed", "canceled"].includes(status) && !records.some(record => String(record.to || record.status || "").toLowerCase() === status)) {
        entries.push({ date: airing.lastVerified || airing.firstAirUtc || "Date not supplied", episodeLabel: `Episode ${episode.number ?? episode.id}`, channel: airing.channel, message: `Current status: ${statusLabel(status)}${airing.notes ? ` — ${airing.notes}` : ""}` });
      }
    });
  });
  entries.sort((a, b) => String(b.date || b.changedAt || "").localeCompare(String(a.date || a.changedAt || "")));
  if (!entries.length) { target.append(makeEmptyState("No change history recorded", "When an airing is rescheduled, confirmed, postponed, or canceled, add a record to changeLog or that airing’s history array in episodes.json.")); return; }
  entries.forEach(record => {
    const row = document.createElement("article"); row.className = "history-entry";
    const heading = document.createElement("strong"); heading.textContent = `${record.episodeLabel}${record.channel ? ` · ${record.channel}` : ""}`;
    const date = textNode(record.date || record.changedAt || "Date not supplied", "history-date");
    const detail = document.createElement("p"); detail.textContent = record.message || record.change || `${record.from || "Previous status"} → ${record.to || "Updated status"}`;
    row.append(heading, date, detail); target.append(row);
  });
}
function makeAiringCard(item) {
  const card = document.createElement("article"); card.className = "airing-card";
  const top = document.createElement("div"); top.className = "card-top";
  const timeWrap = document.createElement("div"); timeWrap.append(textNode(formatTime(item.date), "card-time"), textNode(formatDate(item.date), "card-time-date"));
  top.append(timeWrap, makeStatusNode(item.status)); card.append(top, makeEpisodeNode(item.episode));
  const meta = document.createElement("div"); meta.className = "card-meta";
  meta.append(makeMetaBlock("CHANNEL", item.channel || "Not specified"), makeMetaBlock("DUB / LANGUAGE", item.languages.join(" · ") || "Not specified"), makeMetaBlock("REGION", item.regions.join(" · ") || "Not specified")); card.append(meta);
  card.append(makeWatchButton(item.episode));
  const bottom = document.createElement("div"); bottom.className = "card-bottom"; bottom.append(makeSourceNode(item.source, item.lastVerified)); card.append(bottom); return card;
}
function makeCompactAiring(item) {
  const row = document.createElement("div"); row.className = "compact-airing";
  row.append(textNode(formatTime(item.date), "air-time"), makeEpisodeNode(item.episode), textNode(item.channel || "Channel not specified", "muted"), makeLanguageNodes(item.languages), textNode(item.regions.join(" · ") || "Region unspecified", "muted small"), makeStatusNode(item.status), makeWatchButton(item.episode)); return row;
}
function makeMetaBlock(label, value) { const block = document.createElement("div"); block.append(textNode(label, "meta-label"), textNode(value, "meta-value")); return block; }
function makeTimeNode(date) { const wrap = document.createElement("div"); wrap.append(textNode(formatTime(date), "air-time"), textNode(formatDate(date), "air-date-small")); return wrap; }
function makeEpisodeNode(episode, includeArtwork = true) {
  const wrap = document.createElement("div"); const title = document.createElement("div"); title.className = "episode-name";
  const number = episode.number !== undefined ? episode.number : episode.id; title.textContent = `Episode ${number ?? "?"}${episode.title ? ` — ${episode.title}` : ""}`;
  const headingRow = document.createElement("div"); headingRow.className = "episode-heading-row";
  if (includeArtwork) headingRow.append(createEpisodeImage(episode, false));
  const headingText = document.createElement("div"); headingText.className = "episode-heading-text"; headingText.append(title);
  if (episode.titleOriginal) headingText.append(textNode(episode.titleOriginal, "episode-subtitle"));
  if (episode.productionCode) headingText.append(textNode(`Production code: ${episode.productionCode}`, "episode-subtitle"));
  headingRow.append(headingText); wrap.append(headingRow);
  const episodeKey = String(episode.id ?? episode.number ?? "");
  const related = allAirings().filter(item => String(item.episode.id ?? item.episode.number ?? "") === episodeKey);
  if (episode.synopsis || episode.description || episode.airDateNotes || episode.productionCode || episode.titleTranslations || related.length > 0) {
    const details = document.createElement("details"); details.className = "episode-details";
    const summary = document.createElement("summary"); summary.textContent = "Episode details"; details.append(summary);
    if (episode.synopsis || episode.description) {
      const description = document.createElement("p"); description.textContent = episode.synopsis || episode.description; details.append(description);
    }
    if (episode.titleTranslations && typeof episode.titleTranslations === "object") { const translations = Object.entries(episode.titleTranslations).map(([lang, title]) => `${lang}: ${title}`).join(" · "); if (translations) details.append(textNode(`Title translations — ${translations}`, "episode-subtitle")); }
    if (episode.airDateNotes) { const notes = document.createElement("p"); notes.textContent = episode.airDateNotes; details.append(notes); }
    if (related.length > 0) {
      const heading = document.createElement("strong"); heading.className = "details-subheading"; heading.textContent = "Known first airings"; details.append(heading);
      const list = document.createElement("ul"); list.className = "episode-airing-list";
      related.forEach(item => {
        const li = document.createElement("li");
        li.append(textNode(`${formatDate(item.date)} · ${formatTime(item.date)} — ${item.channel || "Channel not specified"} — ${item.languages.join(" / ") || "Language not specified"} (${statusLabel(item.status)})`, "episode-airing-summary"));
        if (item.source && /^https?:\/\//i.test(item.source)) li.append(document.createTextNode(" "), makeSourceNode(item.source, item.lastVerified));
        list.append(li);
      });
      details.append(list);
    }
    wrap.append(details);
  }
  return wrap;
}
function makeLanguageNodes(languages) {
  const wrap = document.createElement("span"); wrap.className = "language-list";
  if (!languages.length) { wrap.append(textNode("Language not specified", "muted")); return wrap; }
  languages.forEach(language => wrap.append(textNode(language, "dub-pill"))); return wrap;
}
function makeStatusNode(status) { return textNode(statusLabel(status), `status-pill status-${status}`); }
function statusLabel(status) { return STATUS_LABELS[status] || status.charAt(0).toUpperCase() + status.slice(1); }
function makeSourceNode(source, lastVerified) {
  const wrap = document.createElement("div");
  if (typeof source === "string" && /^https?:\/\//i.test(source)) {
    const link = document.createElement("a"); link.className = "source-link"; link.href = source; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "View source ↗"; wrap.append(link);
  } else wrap.append(textNode("Source not supplied", "muted"));
  if (lastVerified) wrap.append(textNode(`Checked ${lastVerified}`, "last-verified")); return wrap;
}
function makeEmptyState(title, description) { const box = document.createElement("div"); box.className = "empty-state"; const icon = textNode("◷", "empty-icon"); const heading = document.createElement("h3"); heading.textContent = title; const paragraph = document.createElement("p"); paragraph.textContent = description; box.append(icon, heading, paragraph); return box; }
function textNode(text, className) { const node = document.createElement("span"); node.className = className; node.textContent = text; return node; }
function cell(child) { const td = document.createElement("td"); td.append(child); return td; }
function formatTime(date) { return new Intl.DateTimeFormat(undefined, { timeZone: state.timeZone, hour: "numeric", minute: "2-digit" }).format(date); }
function formatDate(date) { return new Intl.DateTimeFormat(undefined, { timeZone: state.timeZone, month: "short", day: "numeric", year: "numeric" }).format(date); }
function formatDateKey(key) { return new Intl.DateTimeFormat(undefined, { timeZone: "UTC", dateStyle: "full" }).format(keyPartsDate(key)); }
function countdownText(date) {
  const seconds = Math.max(0, Math.floor((date.getTime() - Date.now()) / 1000));
  const days = Math.floor(seconds / 86400), hours = Math.floor((seconds % 86400) / 3600), minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `In ${days}d ${hours}h`; if (hours) return `In ${hours}h ${minutes}m`; return `In ${minutes}m`;
}
function updateTimezoneLabel() { el["timezone-label"].textContent = `Times shown in ${state.timeZone}`; if (el["timezone-select"]) el["timezone-select"].value = state.timeZone === localZone ? "local" : state.timeZone; }
function populateTimeZones() {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : FALLBACK_ZONES;
  const select = el["timezone-select"]; select.replaceChildren(new Option("Use device time zone", "local"));
  const all = uniqueSorted([...zones, localZone, "UTC"]);
  all.forEach(zone => select.add(new Option(zone, zone)));
  select.value = "local";
}
function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem("mlbS7Preferences") || "{}");
    state.favoriteChannels = Array.isArray(saved.favoriteChannels) ? saved.favoriteChannels : [];
    state.favoriteDubs = Array.isArray(saved.favoriteDubs) ? saved.favoriteDubs : [];
    state.watchedEpisodes = Array.isArray(saved.watchedEpisodes) ? saved.watchedEpisodes : [];
    state.watchlistEpisodes = Array.isArray(saved.watchlistEpisodes) ? saved.watchlistEpisodes : [];
    state.favoritesOnly = saved.favoritesOnly === true;
    state.includeUnconfirmed = saved.includeUnconfirmed === true;
    if (saved.timeZone && (saved.timeZone === localZone || saved.timeZone === "UTC" || isTimeZone(saved.timeZone))) state.timeZone = saved.timeZone;
    state.selectedDate = dateKeyInZone(new Date(), state.timeZone); state.month = monthFromKey(state.selectedDate);
    el["include-unconfirmed"].checked = state.includeUnconfirmed; el["favorites-only"].checked = state.favoritesOnly;
  } catch (_) { /* Storage may be disabled; the site still works without saved preferences. */ }
}
function savePreferences() {
  state.favoriteChannels = [...el["favorite-channels"].selectedOptions].map(option => option.value);
  state.favoriteDubs = [...el["favorite-dubs"].selectedOptions].map(option => option.value);
  try { localStorage.setItem("mlbS7Preferences", JSON.stringify({ favoriteChannels: state.favoriteChannels, favoriteDubs: state.favoriteDubs, watchedEpisodes: state.watchedEpisodes, watchlistEpisodes: state.watchlistEpisodes, favoritesOnly: state.favoritesOnly, includeUnconfirmed: state.includeUnconfirmed, timeZone: state.timeZone })); el["settings-message"].textContent = "Preferences saved in this browser."; }
  catch (_) { el["settings-message"].textContent = "This browser does not allow local storage; preferences will last only until you leave this page."; }
  renderAll();
}
function isTimeZone(zone) { try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch (_) { return false; } }
function applyUrlState() {
  const params = new URLSearchParams(location.search);
  state.search = (params.get("q") || "").toLocaleLowerCase(); state.channel = params.get("channel") || ""; state.dub = params.get("dub") || ""; state.region = params.get("region") || ""; state.status = params.get("status") || "";
  state.includeUnconfirmed = params.get("unconfirmed") === "1" || state.includeUnconfirmed;
  state.favoritesOnly = params.get("favorites") === "1" || state.favoritesOnly;
  if (params.get("tz") && isTimeZone(params.get("tz"))) state.timeZone = params.get("tz");
  if (!params.get("date")) state.selectedDate = dateKeyInZone(new Date(), state.timeZone);
  if (params.get("date") && /^\d{4}-\d{2}-\d{2}$/.test(params.get("date"))) state.selectedDate = params.get("date");
  if (params.get("month") && /^\d{4}-\d{2}$/.test(params.get("month"))) { const [year, month] = params.get("month").split("-").map(Number); state.month = new Date(year, month - 1, 1); } else state.month = monthFromKey(state.selectedDate);
  el["search-input"].value = state.search; el["clear-search"].hidden = !state.search; if (el["region-filter"]) el["region-filter"].value = state.region; el["include-unconfirmed"].checked = state.includeUnconfirmed; el["favorites-only"].checked = state.favoritesOnly;
}
function updateUrlState() {
  const params = new URLSearchParams();
  if (state.search) params.set("q", state.search); if (state.channel) params.set("channel", state.channel); if (state.dub) params.set("dub", state.dub); if (state.status) params.set("status", state.status);
  if (state.includeUnconfirmed) params.set("unconfirmed", "1"); if (state.favoritesOnly) params.set("favorites", "1");
  if (state.timeZone !== localZone) params.set("tz", state.timeZone); if (state.selectedDate) params.set("date", state.selectedDate);
  params.set("month", `${state.month.getFullYear()}-${pad(state.month.getMonth() + 1)}`);
  const query = params.toString(); history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}
async function shareView() {
  updateUrlState(); const url = location.href;
  try { await navigator.clipboard.writeText(url); el["settings-message"].textContent = "Shareable view link copied."; }
  catch (_) { window.prompt("Copy this link to share the current view:", url); }
}
function jumpToEpisode() {
  const query = el["episode-jump"].value.trim().toLocaleLowerCase(); if (!query) return;
  const item = visibleAirings().find(a => String(a.episode.id ?? "").toLowerCase() === query || String(a.episode.number ?? "").toLowerCase() === query || String(a.episode.title || "").toLocaleLowerCase().includes(query));
  if (!item) { el["settings-message"].textContent = "No visible airing matched that episode number or title."; return; }
  state.selectedDate = item.localDate; state.month = monthFromKey(item.localDate); renderAll(); updateUrlState(); document.querySelector(".day-panel").scrollIntoView({ behavior: "smooth" });
}
function validateData() {
  const issues = []; const seen = new Map(); const validStatuses = new Set([...SCHEDULE_STATUSES, "postponed", "canceled"]);
  state.episodes.forEach((episode, index) => {
    if (!episode || typeof episode !== "object") { issues.push(`Episode entry ${index + 1}: must be an object.`); return; }
    const id = episode.id ?? episode.number;
    if (id === undefined || id === null || String(id).trim() === "") issues.push(`Episode entry ${index + 1}: missing id/number.`);
    if (!episode.title) issues.push(`Episode ${id ?? index + 1}: missing title.`);
    if (!Array.isArray(episode.airings)) { issues.push(`Episode ${id ?? index + 1}: airings must be an array.`); return; }
    episode.airings.forEach((airing, airingIndex) => {
      const label = `Episode ${id ?? index + 1}, airing ${airingIndex + 1}`;
      if (!airing || typeof airing !== "object") { issues.push(`${label}: airing must be an object.`); return; }
      const status = normalizeStatus(airing); const date = parseTimestamp(airing.firstAirUtc); const languages = normalizeLanguages(airing);
      if (!validStatuses.has(status)) issues.push(`${label}: unsupported status “${status}”.`);
      if (!date) issues.push(`${label}: firstAirUtc must be a valid ISO timestamp ending in Z (UTC).`);
      if (!airing.channel) issues.push(`${label}: missing channel.`);
      if (!languages.length) issues.push(`${label}: missing dub/language; use dub: "English" or dub: ["English", "French"].`);
      if (!airing.source || !/^https?:\/\//i.test(airing.source)) issues.push(`${label}: missing valid source URL.`);
      if (!airing.region && !airing.regions && !airing.country) issues.push(`${label}: region/country not supplied (optional but recommended for international tracking).`);
      if (airing.lastVerified && /^\d{4}-\d{2}-\d{2}$/.test(airing.lastVerified)) { const age = (Date.now() - Date.parse(`${airing.lastVerified}T00:00:00Z`)) / 86400000; if (age > 180) issues.push(`${label}: source last verified over 180 days ago.`); }
      if (!airing.lastVerified) issues.push(`${label}: lastVerified date not supplied.`);
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(airing.lastVerified) || Number.isNaN(Date.parse(`${airing.lastVerified}T00:00:00Z`))) issues.push(`${label}: lastVerified must use YYYY-MM-DD format.`);
      if (date) {
        const key = [id, airing.channel || "", date.toISOString(), languages.map(language => language.toLocaleLowerCase()).sort().join("|")].join("::");
        if (seen.has(key)) issues.push(`${label}: duplicate of ${seen.get(key)} (same episode, channel, time, and languages).`); else seen.set(key, label);
      }
    });
  });
  const target = el["validation-results"]; target.hidden = false; target.replaceChildren();
  const heading = document.createElement("h3");
  heading.textContent = !state.episodes.length ? "No schedule entries to validate" : issues.length ? `Found ${issues.length} data issue${issues.length === 1 ? "" : "s"}` : "No data issues found";
  target.append(heading);
  if (!state.episodes.length) target.append(textNode("The data file is empty. Add verified entries before validating the schedule.", "muted"));
  else if (!issues.length) target.append(textNode("All current entries passed the available checks.", "validation-success"));
  else { const list = document.createElement("ul"); issues.forEach(issue => { const li = document.createElement("li"); li.textContent = issue; list.append(li); }); target.append(list); }
}
function exportCsv() {
  const entries = visibleAirings();
  const rows = [["Episode ID", "Episode number", "Title", "UTC first air", "Displayed date", "Displayed time", "Time zone", "Channel", "Languages", "Status", "Source", "Last verified"]];
  entries.forEach(item => rows.push([item.episode.id ?? "", item.episode.number ?? "", item.episode.title ?? "", item.date.toISOString(), formatDate(item.date), formatTime(item.date), state.timeZone, item.channel ?? "", item.languages.join("; "), statusLabel(item.status), item.source ?? "", item.lastVerified ?? ""]));
  downloadFile("mlb-s7-visible-schedule.csv", "text/csv;charset=utf-8", rows.map(row => row.map(csvEscape).join(",")).join("\r\n"));
}
function csvEscape(value) { const text = String(value ?? ""); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function exportCalendar() {
  const entries = allAirings().filter(isConfirmed);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MLB S7 Air Dates//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  entries.forEach(item => {
    const start = item.date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const end = new Date(item.date.getTime() + 30 * 60000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const title = `Miraculous S7 Episode ${item.episode.number ?? item.episode.id}${item.episode.title ? ` - ${item.episode.title}` : ""}`;
    const description = `Channel: ${item.channel || "Not specified"}\nLanguages: ${item.languages.join(", ") || "Not specified"}\nStatus: ${statusLabel(item.status)}\nSource: ${item.source || "Not supplied"}`;
    const uidBase = `${item.episode.id ?? item.episode.number}-${item.date.getTime()}-${(item.channel || "channel").replace(/[^a-z0-9]/gi, "")}`;
    lines.push("BEGIN:VEVENT", `UID:${icsEscape(uidBase)}@mlb-s7-airdates`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`, `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${icsEscape(title)}`, `DESCRIPTION:${icsEscape(description)}`, "END:VEVENT");
  });
  lines.push("END:VCALENDAR"); downloadFile("mlb-s7-confirmed-airings.ics", "text/calendar;charset=utf-8", lines.join("\r\n"));
}
function icsEscape(value) { return String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
function downloadFile(filename, type, content) {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function enableReminders() {
  if (!("Notification" in window)) { el["settings-message"].textContent = "Browser notifications are not supported here. Calendar export is available as an alternative."; return; }
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") { state.reminderEnabled = true; el["settings-message"].textContent = "Reminders enabled while this page remains open. The browser may limit notifications in the background."; checkReminder(); }
    else el["settings-message"].textContent = "Notification permission was not granted. You can still export the confirmed schedule to your calendar.";
  } catch (_) { el["settings-message"].textContent = "Could not enable notifications in this browser."; }
}
function checkReminder() {
  if (!state.reminderEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
  const now = Date.now(); const next = allAirings().filter(item => isConfirmed(item) && item.date.getTime() >= now && item.date.getTime() - now <= 5 * 60000).sort((a, b) => a.date - b.date)[0];
  if (!next) return;
  const key = `${next.episode.id}-${next.date.toISOString()}-${next.channel}`; if (state.notifiedKeys.has(key)) return;
  state.notifiedKeys.add(key); new Notification("Miraculous S7 airing soon", { body: `Episode ${next.episode.number ?? next.episode.id} · ${next.channel || "Channel not specified"} · ${next.languages.join(" / ")}` });
}


// International coverage, source-quality overview, and a private browser-local watch tracker.
function episodeStableKey(episode) { return String(episode.id ?? episode.number ?? episode.title ?? ""); }
function saveLocalTracker() {
  try { localStorage.setItem("mlbS7Preferences", JSON.stringify({ favoriteChannels: state.favoriteChannels, favoriteDubs: state.favoriteDubs, watchedEpisodes: state.watchedEpisodes, watchlistEpisodes: state.watchlistEpisodes, favoritesOnly: state.favoritesOnly, includeUnconfirmed: state.includeUnconfirmed, timeZone: state.timeZone })); } catch (_) {}
}
function makeWatchButton(episode) {
  const key = episodeStableKey(episode); const button = document.createElement("button"); button.type = "button"; button.className = "button button-quiet watch-toggle";
  const watched = state.watchedEpisodes.includes(key); const saved = state.watchlistEpisodes.includes(key);
  button.textContent = watched ? "✓ Watched" : saved ? "★ In watchlist · mark watched" : "+ Watchlist";
  button.setAttribute("aria-label", `${watched ? "Mark unwatched" : saved ? "Mark watched" : "Add to watchlist"}: Episode ${episode.number ?? episode.id ?? "?"}`);
  button.addEventListener("click", () => {
    if (watched) { state.watchedEpisodes = state.watchedEpisodes.filter(item => item !== key); }
    else if (saved) { state.watchlistEpisodes = state.watchlistEpisodes.filter(item => item !== key); state.watchedEpisodes.push(key); }
    else { state.watchlistEpisodes.push(key); }
    saveLocalTracker(); renderAll();
  });
  button.addEventListener("contextmenu", event => { event.preventDefault(); if (!state.watchedEpisodes.includes(key)) state.watchedEpisodes.push(key); state.watchlistEpisodes = state.watchlistEpisodes.filter(item => item !== key); saveLocalTracker(); renderAll(); });
  button.title = "Click to cycle watchlist status; right-click to mark watched on desktop.";
  return button;
}
function renderWatchlist() {
  const target = el["watchlist-content"]; if (!target) return; target.replaceChildren();
  const unique = new Map(state.episodes.map(ep => [episodeStableKey(ep), ep]));
  const entries = [...unique.entries()].filter(([key]) => state.watchlistEpisodes.includes(key) || state.watchedEpisodes.includes(key));
  el["watchlist-count"].textContent = `${state.watchedEpisodes.length} watched · ${state.watchlistEpisodes.length} saved`;
  if (!entries.length) { target.append(makeEmptyState("Your watchlist is empty", "Use + Watchlist on an episode to save it here. Your list stays in this browser.")); return; }
  entries.sort((a,b) => Number(a[1].number ?? a[1].id) - Number(b[1].number ?? b[1].id));
  entries.forEach(([key, episode]) => {
    const row = document.createElement("article"); row.className = "watchlist-item";
    const info = document.createElement("div"); info.append(makeEpisodeNode(episode), textNode(state.watchedEpisodes.includes(key) ? "Watched" : "Plan to watch", "muted small"));
    const actions = document.createElement("div"); actions.className = "watchlist-actions";
    const toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "button button-secondary"; toggle.textContent = state.watchedEpisodes.includes(key) ? "Mark unwatched" : "Mark watched";
    toggle.addEventListener("click", () => { if (state.watchedEpisodes.includes(key)) state.watchedEpisodes = state.watchedEpisodes.filter(v => v !== key); else { state.watchedEpisodes.push(key); state.watchlistEpisodes = state.watchlistEpisodes.filter(v => v !== key); } saveLocalTracker(); renderAll(); });
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "button button-quiet"; remove.textContent = "Remove";
    remove.addEventListener("click", () => { state.watchlistEpisodes = state.watchlistEpisodes.filter(v => v !== key); state.watchedEpisodes = state.watchedEpisodes.filter(v => v !== key); saveLocalTracker(); renderAll(); });
    actions.append(toggle, remove); row.append(info, actions); target.append(row);
  });
}
function renderVerification() {
  const target = el["verification-content"]; if (!target) return; target.replaceChildren();
  const records = state.episodes.flatMap(episode => (Array.isArray(episode.airings) ? episode.airings : []).map(airing => ({episode, airing})));
  const now = Date.now(); let missingSource=0, missingVerified=0, stale=0, missingRegion=0, invalidSource=0;
  records.forEach(({airing}) => {
    if (!airing.source) missingSource++;
    else if (!/^https?:\/\//i.test(airing.source)) invalidSource++;
    if (!airing.lastVerified) missingVerified++;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(airing.lastVerified) && now - Date.parse(`${airing.lastVerified}T00:00:00Z`) > 180*86400000) stale++;
    if (!(airing.region || airing.regions || airing.country)) missingRegion++;
  });
  const grid = document.createElement("div"); grid.className="verification-stats";
  [["Airing records",records.length],["Missing source",missingSource],["Invalid source URL",invalidSource],["Missing check date",missingVerified],["Check older than 180 days",stale],["Missing region",missingRegion]].forEach(([label,value])=>{const box=document.createElement("div");box.className="verification-stat";box.append(textNode(String(value),"verification-number"),textNode(label,"muted small"));grid.append(box);});
  target.append(grid);
  const list=document.createElement("div");list.className="verification-list";
  records.forEach(({episode,airing})=>{
    const status = !airing.source ? "Missing source" : !/^https?:\/\//i.test(airing.source) ? "Invalid source URL" : !airing.lastVerified ? "Not checked" : (now-Date.parse(`${airing.lastVerified}T00:00:00Z`)>180*86400000 ? "Stale check" : "Metadata complete");
    const row=document.createElement("article");row.className="verification-row";
    const label=document.createElement("div");label.append(textNode(`Episode ${episode.number ?? episode.id ?? "?"}${episode.title ? ` — ${episode.title}` : ""}`,"verification-episode"),textNode(`${airing.channel || "Channel unspecified"} · ${normalizeRegions(airing).join(", ") || "Region unspecified"}`,"muted small"));
    const details=document.createElement("div");details.append(textNode(status,`verification-badge ${status === "Metadata complete" ? "is-ok" : "is-warning"}`));
    if (airing.source && /^https?:\/\//i.test(airing.source)) { const a=document.createElement("a");a.href=airing.source;a.target="_blank";a.rel="noopener noreferrer";a.className="source-link";a.textContent=airing.sourcePublisher ? `Source: ${airing.sourcePublisher}` : "Open source ↗";details.append(a); }
    if (airing.evidenceType) details.append(textNode(`Evidence: ${airing.evidenceType}`,"muted small"));
    if (airing.lastVerified) details.append(textNode(`Last checked: ${airing.lastVerified}`,"muted small"));
    row.append(label,details);list.append(row);
  });
  if (!records.length) target.append(makeEmptyState("No source records yet", "When verified airing records are added, this dashboard will report source and regional metadata completeness.")); else target.append(list);
}
