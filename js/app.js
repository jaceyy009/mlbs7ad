const DATA_URL = "data/episodes.json";

const state = {
  episodes: [],
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: localDateKey(new Date()),
  search: "",
  channel: "",
  dub: ""
};

const el = {};
document.addEventListener("DOMContentLoaded", init);

async function init() {
  [
    "timezone-label", "search-input", "clear-search", "channel-filter", "dub-filter",
    "reset-filters", "month-title", "month-summary", "calendar-grid", "prev-month",
    "next-month", "today-button", "day-title", "day-summary", "schedule-content",
    "search-results", "result-count", "results-content", "load-error", "back-to-calendar"
  ].forEach(id => el[id] = document.getElementById(id));

  el["timezone-label"].textContent = `Times shown in ${Intl.DateTimeFormat().resolvedOptions().timeZone || "your local timezone"}`;

  bindEvents();
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${DATA_URL} (${response.status}).`);
    const data = await response.json();
    state.episodes = Array.isArray(data.episodes) ? data.episodes : [];
    populateFilters();
    renderAll();
  } catch (error) {
    el["load-error"].hidden = false;
    el["load-error"].textContent = `${error.message} If you opened index.html directly, try running the site through GitHub Pages or a local web server.`;
    renderCalendar();
    renderSelectedDay();
  }
}

function bindEvents() {
  el["prev-month"].addEventListener("click", () => changeMonth(-1));
  el["next-month"].addEventListener("click", () => changeMonth(1));
  el["today-button"].addEventListener("click", () => {
    const today = new Date();
    state.month = new Date(today.getFullYear(), today.getMonth(), 1);
    state.selectedDate = localDateKey(today);
    renderAll();
  });
  el["search-input"].addEventListener("input", event => {
    state.search = event.target.value.trim().toLocaleLowerCase();
    el["clear-search"].hidden = !event.target.value;
    renderSearch();
    renderCalendar();
  });
  el["clear-search"].addEventListener("click", () => {
    el["search-input"].value = "";
    state.search = "";
    el["clear-search"].hidden = true;
    renderAll();
    el["search-input"].focus();
  });
  el["channel-filter"].addEventListener("change", event => {
    state.channel = event.target.value;
    renderAll();
  });
  el["dub-filter"].addEventListener("change", event => {
    state.dub = event.target.value;
    renderAll();
  });
  el["reset-filters"].addEventListener("click", () => {
    state.search = "";
    state.channel = "";
    state.dub = "";
    el["search-input"].value = "";
    el["channel-filter"].value = "";
    el["dub-filter"].value = "";
    el["clear-search"].hidden = true;
    renderAll();
  });
  el["back-to-calendar"].addEventListener("click", () => {
    document.querySelector(".calendar-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseTimestamp(value) {
  if (typeof value !== "string" || !value.endsWith("Z")) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function allAirings() {
  const result = [];
  for (const episode of state.episodes) {
    for (const airing of (Array.isArray(episode.airings) ? episode.airings : [])) {
      // Fail closed: only explicitly confirmed entries with a valid UTC timestamp appear.
      if (airing.confirmed !== true) continue;
      const date = parseTimestamp(airing.firstAirUtc);
      if (!date) continue;
      result.push({ ...airing, episode, date, localDate: localDateKey(date) });
    }
  }
  return result.sort((a, b) => a.date - b.date || String(a.episode.id).localeCompare(String(b.episode.id)));
}

function filteredAirings({ includeSearch = true } = {}) {
  const query = includeSearch ? state.search : "";
  return allAirings().filter(item => {
    if (state.channel && item.channel !== state.channel) return false;
    if (state.dub && item.dub !== state.dub) return false;
    if (!query) return true;
    const haystack = [
      item.episode.id, item.episode.number, item.episode.title,
      item.channel, item.dub, item.episode.titleOriginal
    ].filter(value => value !== undefined && value !== null).join(" ").toLocaleLowerCase();
    return haystack.includes(query);
  });
}

function populateFilters() {
  const airings = allAirings();
  fillSelect(el["channel-filter"], [...new Set(airings.map(a => a.channel).filter(Boolean))].sort(), "All channels");
  fillSelect(el["dub-filter"], [...new Set(airings.map(a => a.dub).filter(Boolean))].sort(), "All dubs");
}

function fillSelect(select, values, label) {
  const oldValue = select.value;
  select.replaceChildren(new Option(label, ""));
  values.forEach(value => select.add(new Option(value, value)));
  if (values.includes(oldValue)) select.value = oldValue;
}

function renderAll() {
  renderCalendar();
  renderSelectedDay();
  renderSearch();
}

function changeMonth(delta) {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + delta, 1);
  renderCalendar();
}

function renderCalendar() {
  const year = state.month.getFullYear();
  const month = state.month.getMonth();
  el["month-title"].textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(state.month);

  const entries = filteredAirings();
  const monthEntries = entries.filter(item => {
    const d = item.date;
    return d.getFullYear() === year && d.getMonth() === month;
  });
  el["month-summary"].textContent = `${monthEntries.length} confirmed ${monthEntries.length === 1 ? "airing" : "airings"}`;

  const grid = el["calendar-grid"];
  // Keep the seven weekday headers and rebuild the date cells.
  while (grid.children.length > 7) grid.removeChild(grid.lastChild);

  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());
  const todayKey = localDateKey(new Date());
  const counts = new Map();
  for (const item of entries) counts.set(item.localDate, (counts.get(item.localDate) || 0) + 1);

  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = localDateKey(date);
    const inMonth = date.getMonth() === month;
    const count = counts.get(key) || 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-cell";
    if (!inMonth) button.classList.add("outside-month");
    if (key === state.selectedDate) button.classList.add("selected");
    if (key === todayKey) button.classList.add("today");
    button.setAttribute("aria-pressed", String(key === state.selectedDate));
    button.setAttribute("aria-label", `${new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date)}${count ? `, ${count} confirmed airings` : ", no confirmed airings"}`);

    const number = document.createElement("span");
    number.className = "day-number";
    number.textContent = date.getDate();
    button.append(number);

    if (count) {
      const countEl = document.createElement("span");
      countEl.className = "day-count";
      const dot = document.createElement("span");
      dot.className = "count-dot";
      const label = document.createElement("span");
      label.className = "count-label";
      label.textContent = `${count} ${count === 1 ? "airing" : "airs"}`;
      countEl.append(dot, label);
      button.append(countEl);
    }
    button.addEventListener("click", () => {
      state.selectedDate = key;
      if (!inMonth) state.month = new Date(date.getFullYear(), date.getMonth(), 1);
      renderAll();
      if (window.matchMedia("(max-width: 640px)").matches) {
        document.querySelector(".day-panel").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    grid.append(button);
  }
}

function renderSelectedDay() {
  const date = new Date(`${state.selectedDate}T12:00:00`);
  el["day-title"].textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date);
  const entries = filteredAirings().filter(item => item.localDate === state.selectedDate);
  el["day-summary"].textContent = `${entries.length} confirmed ${entries.length === 1 ? "first airing" : "first airings"} in your local time`;
  el["schedule-content"].replaceChildren();

  if (!entries.length) {
    el["schedule-content"].append(makeEmptyState(
      "No confirmed first airs on this date",
      "There are no matching confirmed airings for this local date. Dates that have not been confirmed are intentionally omitted. Try another date or change your search and filters."
    ));
    return;
  }

  const table = document.createElement("table");
  table.className = "schedule-table";
  table.innerHTML = `<thead><tr><th>Local time</th><th>Episode</th><th>Channel</th><th>Dub / language</th><th>Status</th><th>Source</th></tr></thead>`;
  const tbody = document.createElement("tbody");
  entries.forEach(item => {
    const tr = document.createElement("tr");
    tr.append(
      cell(makeTimeNode(item.date)),
      cell(makeEpisodeNode(item.episode)),
      cell(textNode(item.channel || "Not specified", "channel-name")),
      cell(textNode(item.dub || "Not specified", "dub-pill")),
      cell(textNode("Confirmed first air", "confirmed-pill")),
      cell(makeSourceNode(item.source))
    );
    tbody.append(tr);
  });
  table.append(tbody);
  el["schedule-content"].append(table);

  const cards = document.createElement("div");
  cards.className = "airing-cards";
  entries.forEach(item => cards.append(makeAiringCard(item)));
  el["schedule-content"].append(cards);
}

function renderSearch() {
  const queryActive = Boolean(state.search || state.channel || state.dub);
  el["search-results"].hidden = !queryActive;
  if (!queryActive) return;

  const entries = filteredAirings();
  el["result-count"].textContent = `${entries.length} ${entries.length === 1 ? "result" : "results"}`;
  el["results-content"].replaceChildren();
  if (!entries.length) {
    el["results-content"].append(makeEmptyState(
      "No matching airings",
      "Try a different episode number, title, channel, or dub. Only explicitly confirmed first-time airings are searchable."
    ));
    return;
  }

  entries.forEach(item => {
    const row = document.createElement("div");
    row.className = "search-result-item";
    const main = document.createElement("div");
    main.className = "result-main";
    main.append(makeEpisodeNode(item.episode));
    const meta = document.createElement("div");
    meta.className = "result-meta";
    meta.append(textNode(item.channel || "Channel not specified", "dub-pill"));
    meta.append(textNode(item.dub || "Dub not specified", "dub-pill"));
    main.append(meta);
    const dateButton = document.createElement("button");
    dateButton.type = "button";
    dateButton.className = "button button-secondary result-date";
    dateButton.textContent = `${formatDate(item.date)} · ${formatTime(item.date)}`;
    dateButton.addEventListener("click", () => {
      state.selectedDate = item.localDate;
      state.month = new Date(item.date.getFullYear(), item.date.getMonth(), 1);
      renderAll();
      document.querySelector(".day-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    row.append(main, dateButton);
    el["results-content"].append(row);
  });
}

function makeAiringCard(item) {
  const card = document.createElement("article");
  card.className = "airing-card";
  const top = document.createElement("div");
  top.className = "card-top";
  const timeWrap = document.createElement("div");
  const time = document.createElement("div");
  time.className = "card-time";
  time.textContent = formatTime(item.date);
  const date = document.createElement("div");
  date.className = "card-time-date";
  date.textContent = formatDate(item.date);
  timeWrap.append(time, date);
  top.append(timeWrap, textNode("Confirmed first air", "confirmed-pill"));
  card.append(top, makeEpisodeNode(item.episode));

  const meta = document.createElement("div");
  meta.className = "card-meta";
  const channel = document.createElement("div");
  channel.innerHTML = `<span class="meta-label">CHANNEL</span>`;
  channel.append(textNode(item.channel || "Not specified", "meta-value"));
  const dub = document.createElement("div");
  dub.innerHTML = `<span class="meta-label">DUB / LANGUAGE</span>`;
  dub.append(textNode(item.dub || "Not specified", "meta-value"));
  meta.append(channel, dub);
  card.append(meta);

  const bottom = document.createElement("div");
  bottom.className = "card-bottom";
  bottom.append(makeSourceNode(item.source));
  card.append(bottom);
  return card;
}

function makeTimeNode(date) {
  const wrap = document.createElement("div");
  const time = textNode(formatTime(date), "air-time");
  const dateLine = textNode(formatDate(date), "air-date-small");
  wrap.append(time, dateLine);
  return wrap;
}

function makeEpisodeNode(episode) {
  const wrap = document.createElement("div");
  const title = document.createElement("div");
  title.className = "episode-name";
  const number = episode.number !== undefined ? episode.number : episode.id;
  title.textContent = `Episode ${number}${episode.title ? ` — ${episode.title}` : ""}`;
  wrap.append(title);
  if (episode.titleOriginal) wrap.append(textNode(episode.titleOriginal, "episode-subtitle"));
  return wrap;
}

function makeSourceNode(source) {
  if (typeof source === "string" && /^https?:\/\//i.test(source)) {
    const link = document.createElement("a");
    link.className = "source-link";
    link.href = source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "View source ↗";
    return link;
  }
  return textNode("—", "muted");
}

function makeEmptyState(title, description) {
  const box = document.createElement("div");
  box.className = "empty-state";
  const icon = textNode("◷", "empty-icon");
  const heading = document.createElement("h3");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = description;
  box.append(icon, heading, paragraph);
  return box;
}

function textNode(text, className) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}

function cell(child) {
  const td = document.createElement("td");
  td.append(child);
  return td;
}

function formatTime(date) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}
