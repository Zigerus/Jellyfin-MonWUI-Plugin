// Fork Zigerus (4.0.0.93): the "Tag rows" editor on the Home Rows settings tab (design approved on the MonWUI Redesign
// canvas, board "Lumen: Home rows tab + tag rows"). Rules live in ../tagRows.js; this file is only the UI.
// Everything is saved through one hidden input, name="tagRows" (JSON), which applySettings reads like any other field.
// Controls carry no `name`, so nothing else leaks into the form; text the user or the library supplies goes in through
// textContent only.
import { makeApiRequest, getSessionInfo } from "../../../Plugins/JMSFusion/runtime/api.js";
import { withServer } from "../jfUrl.js";
import { createSection } from "./shared.js";
import {
  formatTagRowSeason,
  isTagRowInSeason,
  newTagRowId,
  normalizeTagRow,
  normalizeTagRows,
  tagRowIncludeTypes
} from "../tagRows.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const COMBO_LIMIT = 60;

const ICON = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke-linecap="round"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 15l6-6 6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4" stroke-linecap="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  drag: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="7" r="1.4"/><circle cx="15" cy="7" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="17" r="1.4"/><circle cx="15" cy="17" r="1.4"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

function h(tag, { cls = "", text = null, attrs = null, html = null, on = null } = {}, children = []) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== null && text !== undefined) node.textContent = String(text);
  if (html) node.innerHTML = html; // static icon markup only, never user or library text
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? "" : String(v));
  if (on) for (const [k, v] of Object.entries(on)) node.addEventListener(k, v);
  for (const child of children) if (child) node.appendChild(child);
  return node;
}

function button(cls, { label = "", icon = "", title = null, onClick = null, attrs = null } = {}) {
  const b = h("button", { cls, attrs: { type: "button", "aria-label": title, ...(attrs || {}) }, on: onClick ? { click: onClick } : null });
  if (icon) b.insertAdjacentHTML("beforeend", icon);
  if (label) b.appendChild(h("span", { text: label }));
  return b;
}

function L(labels, key, fallback) {
  const v = labels?.[key];
  return typeof v === "string" && v.trim() ? v : fallback;
}

function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (values[k] ?? ""));
}

function authHeaders() {
  const headers = { Accept: "application/json" };
  try {
    const api = window.ApiClient || window.apiClient;
    const token = (typeof api?.accessToken === "function" ? api.accessToken() : "") || api?._accessToken || "";
    if (token) headers["X-Emby-Token"] = token;
  } catch {}
  return headers;
}

function currentUserId() {
  try { return getSessionInfo()?.userId || window.ApiClient?.getCurrentUserId?.() || ""; } catch { return ""; }
}

let __tagsPromise = null;
function loadLibraryTags() {
  if (!__tagsPromise) {
    __tagsPromise = (async () => {
      const path = "/Plugins/JMSFusion/library-tags";
      const res = await fetch(withServer(path) || path, { cache: "no-store", headers: authHeaders() });
      if (!res.ok) throw new Error(`library-tags HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data?.tags ?? data?.Tags) ? (data.tags ?? data.Tags) : [];
      return {
        titles: Number(data?.titles ?? data?.Titles) || 0,
        items: list.map((t) => ({ name: String(t?.name ?? t?.Name ?? ""), movies: Number(t?.movies ?? t?.Movies) || 0, series: Number(t?.series ?? t?.Series) || 0 }))
          .filter((t) => t.name)
      };
    })().catch((e) => { __tagsPromise = null; throw e; });
  }
  return __tagsPromise;
}

let __genresPromise = null;
function loadLibraryGenres() {
  if (!__genresPromise) {
    __genresPromise = (async () => {
      const uid = currentUserId();
      const data = await makeApiRequest(
        `/Genres?Recursive=true&IncludeItemTypes=Movie,Series&Fields=ItemCounts&SortBy=SortName&SortOrder=Ascending` +
        (uid ? `&UserId=${encodeURIComponent(uid)}` : "")
      );
      const list = Array.isArray(data?.Items) ? data.Items : [];
      return {
        titles: 0,
        items: list.map((g) => ({ name: String(g?.Name || ""), movies: Number(g?.MovieCount) || 0, series: Number(g?.SeriesCount) || 0 }))
          .filter((g) => g.name)
      };
    })().catch((e) => { __genresPromise = null; throw e; });
  }
  return __genresPromise;
}

const __countCache = new Map();
async function countMatches(row, { withGenres = true } = {}) {
  const uid = currentUserId();
  if (!uid || !row.tags.length) return 0;
  const types = tagRowIncludeTypes(row);
  const key = JSON.stringify([types, row.tags.map((t) => t.toLowerCase()).sort(), withGenres ? row.genres.map((g) => g.toLowerCase()).sort() : []]);
  if (__countCache.has(key)) return __countCache.get(key);
  const promise = makeApiRequest(
    `/Users/${encodeURIComponent(uid)}/Items?IncludeItemTypes=${encodeURIComponent(types.join(","))}&Recursive=true&` +
    `Tags=${encodeURIComponent(row.tags.join("|"))}&` +
    (withGenres && row.genres.length ? `Genres=${encodeURIComponent(row.genres.join("|"))}&` : "") +
    `Limit=0&EnableTotalRecordCount=true&EnableImages=false&EnableUserData=false`
  ).then((d) => Number(d?.TotalRecordCount) || 0).catch(() => { __countCache.delete(key); return null; });
  __countCache.set(key, promise);
  return promise;
}

function countFor(option, show) {
  return show === "Series" ? option.series : show === "Both" ? option.movies + option.series : option.movies;
}

function unitFor(row, labels) {
  return row.show === "Series" ? L(labels, "tagRowShowsUnit", "shows") : row.show === "Both" ? L(labels, "tagRowTitles", "titles") : L(labels, "tagRowFilms", "films");
}

function pad(n) { return String(n).padStart(2, "0"); }
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "hidden until Nov 15" / "season over" for a row that is out of season today, so an empty home page has a reason.
function seasonStatus(row, labels, now = new Date()) {
  if (!row.season || isTagRowInSeason(row, now)) return "";
  const d = parseYmd(row.season.from);
  if (!d) return "";
  if (row.season.everyYear === false) {
    if (ymd(now) > row.season.to) return L(labels, "tagRowSeasonOver", "season over");
    return fill(L(labels, "tagRowHiddenUntil", "hidden until {date}"), { date: `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` });
  }
  return fill(L(labels, "tagRowHiddenUntil", "hidden until {date}"), { date: `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}` });
}
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function createTagRowsSection(config, labels) {
  ensureTagRowsStyles();
  let rows = normalizeTagRows(config?.tagRows);
  const expanded = new Set();
  const cards = new Map();

  const section = createSection(L(labels, "tagRowsHeading", "Tag rows"));
  section.classList.add("tagrows-section");
  const hidden = h("input", { attrs: { type: "hidden", name: "tagRows", id: "tagRows" } });
  const save = () => { hidden.value = JSON.stringify(rows.map((r) => normalizeTagRow(r))); };

  const list = h("div", { cls: "tagrows-list", attrs: { role: "list" } });
  const bar = h("div", { cls: "tagrows-bar" }, [
    h("p", { cls: "tagrows-intro", text: L(labels, "tagRowsIntro", "A row of titles that carry tags you pick, like Christmas. Optionally only within some genres, and only between two dates.") }),
    button("tagrows-btn tagrows-add", {
      icon: ICON.plus,
      label: L(labels, "tagRowsAdd", "Add a tag row"),
      onClick: () => {
        const row = normalizeTagRow({ id: newTagRowId(), enabled: true, title: "", tags: [], genres: [], show: "Movie", order: "random", season: null });
        rows.push(row);
        expanded.add(row.id);
        save();
        renderList();
        cards.get(row.id)?.querySelector(".tagrows-title-input")?.focus();
      }
    })
  ]);
  section.append(bar, list, hidden);

  function renderList() {
    list.textContent = "";
    cards.clear();
    if (!rows.length) {
      list.appendChild(h("p", { cls: "tagrows-empty", text: L(labels, "tagRowsEmpty", "No tag rows yet.") }));
    }
    for (const row of rows) {
      const card = buildCard(row);
      cards.set(row.id, card);
      list.appendChild(card);
    }
    save();
  }

  // --- reorder: drag the handle, or focus it and press the arrow keys -----------------------------------------
  let dragId = null;
  list.addEventListener("dragover", (e) => {
    if (!dragId) return;
    e.preventDefault();
    const dragging = cards.get(dragId);
    const over = e.target.closest?.(".tagrows-card");
    if (!dragging || !over || over === dragging) return;
    const r = over.getBoundingClientRect();
    list.insertBefore(dragging, (e.clientY - r.top) > r.height / 2 ? over.nextSibling : over);
  });
  list.addEventListener("drop", (e) => { if (dragId) e.preventDefault(); });
  function finishDrag() {
    if (!dragId) return;
    const order = [...list.querySelectorAll(".tagrows-card")].map((c) => c.dataset.id);
    rows = order.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
    const card = cards.get(dragId);
    if (card) card.draggable = false;
    dragId = null;
    save();
  }
  function move(row, delta) {
    const i = rows.indexOf(row);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= rows.length) return;
    rows.splice(i, 1);
    rows.splice(j, 0, row);
    renderList();
    cards.get(row.id)?.querySelector(".tagrows-handle")?.focus();
  }

  function buildCard(row) {
    const card = h("div", { cls: "tagrows-card", attrs: { role: "listitem", "data-id": row.id } });
    const isOpen = () => expanded.has(row.id);

    const handle = button("tagrows-handle", {
      icon: ICON.drag,
      title: L(labels, "tagRowDrag", "Drag to reorder (or use the arrow keys)"),
      attrs: { "aria-roledescription": "drag handle" }
    });
    handle.addEventListener("pointerdown", () => { card.draggable = true; });
    handle.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp") { e.preventDefault(); move(row, -1); }
      if (e.key === "ArrowDown") { e.preventDefault(); move(row, 1); }
    });
    card.addEventListener("dragstart", (e) => {
      if (!card.draggable) { e.preventDefault(); return; }
      dragId = row.id;
      card.classList.add("is-dragging");
      try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", row.id); } catch {}
    });
    card.addEventListener("dragend", () => { card.classList.remove("is-dragging"); finishDrag(); });

    const sw = button("tagrows-switch", { title: L(labels, "tagRowEnabled", "Show this row"), attrs: { role: "switch", "aria-checked": row.enabled ? "true" : "false" } });
    sw.addEventListener("click", () => {
      row.enabled = !row.enabled;
      sw.setAttribute("aria-checked", row.enabled ? "true" : "false");
      card.classList.toggle("is-off", !row.enabled);
      renderHead();
      save();
    });
    const name = h("span", { cls: "tagrows-name" });
    const meta = h("span", { cls: "tagrows-meta" });
    const toggle = button("tagrows-iconbtn tagrows-toggle", { attrs: { "aria-expanded": isOpen() ? "true" : "false" } });
    const head = h("div", { cls: "tagrows-head" }, [handle, sw, name, meta, h("span", { cls: "tagrows-grow" }), toggle]);
    card.appendChild(head);

    let lastCount = null;
    function renderHead() {
      name.textContent = row.title || L(labels, "tagRowUntitled", "Untitled row");
      card.classList.toggle("is-off", !row.enabled);
      const parts = [];
      if (!row.tags.length) parts.push(L(labels, "tagRowNoTags", "no tags yet"));
      else if (lastCount !== null) parts.push(`${lastCount} ${unitFor(row, labels)}`);
      parts.push(row.order === "rating" ? L(labels, "tagRowTopRated", "Top 10 by rating") : L(labels, "tagRowRandom", "Random"));
      parts.push(formatTagRowSeason(row.season, { allYear: L(labels, "tagRowAllYear", "All year"), everyYear: "" }).replace(/ · $/, ""));
      const status = seasonStatus(row, labels);
      if (status) parts.push(status);
      if (!row.enabled) parts.push(L(labels, "tagRowOff", "off"));
      meta.textContent = "";
      parts.forEach((p, i) => {
        if (i) meta.appendChild(h("i", { attrs: { "aria-hidden": "true" } }));
        meta.appendChild(h("span", { text: p }));
      });
      toggle.innerHTML = isOpen() ? ICON.up : ICON.down;
      toggle.setAttribute("aria-label", isOpen() ? L(labels, "tagRowCollapse", "Hide details") : L(labels, "tagRowExpand", "Show details"));
      toggle.setAttribute("aria-expanded", isOpen() ? "true" : "false");
    }
    toggle.addEventListener("click", () => {
      if (isOpen()) expanded.delete(row.id); else expanded.add(row.id);
      body.hidden = !isOpen();
      if (isOpen() && !body.childElementCount) buildBody();
      renderHead();
    });

    const body = h("div", { cls: "tagrows-body" });
    body.hidden = !isOpen();
    card.appendChild(body);

    function field(labelText, hintText, control) {
      return h("div", { cls: "tagrows-field" }, [
        h("div", { cls: "tagrows-label" }, [h("div", { cls: "tagrows-l", text: labelText }), hintText ? h("div", { cls: "tagrows-d", text: hintText }) : null]),
        h("div", { cls: "tagrows-control" }, [control])
      ]);
    }

    const countLine = h("span", { cls: "tagrows-count", attrs: { "aria-live": "polite" } });
    let countTimer = null;
    function refreshCount() {
      clearTimeout(countTimer);
      countTimer = setTimeout(async () => {
        if (!row.tags.length) {
          lastCount = 0;
          countLine.textContent = L(labels, "tagRowNeedTag", "Pick at least one tag.");
          renderHead();
          return;
        }
        const unit = unitFor(row, labels);
        const narrowed = await countMatches(row, { withGenres: true });
        if (row.genres.length) {
          const total = await countMatches(row, { withGenres: false });
          lastCount = narrowed;
          countLine.textContent = (narrowed === null || total === null) ? "" :
            fill(L(labels, "tagRowNarrowCount", "{n} of the {total} tagged {unit} are {genres}"), { n: narrowed, total, unit, genres: row.genres.join(" / ") });
        } else {
          lastCount = narrowed;
          countLine.textContent = narrowed === null ? "" : fill(L(labels, "tagRowMatchCount", "{n} {unit} match"), { n: narrowed, unit });
        }
        renderHead();
      }, 300);
    }

    function buildBody() {
      // Row title
      const titleInput = h("input", {
        cls: "tagrows-input tagrows-title-input",
        attrs: { type: "text", maxlength: "80", autocomplete: "off", placeholder: L(labels, "tagRowTitlePlaceholder", "e.g. Christmas"), "aria-label": L(labels, "tagRowTitle", "Row title") }
      });
      titleInput.value = row.title;
      titleInput.addEventListener("input", () => { row.title = titleInput.value.slice(0, 80); renderHead(); save(); });
      titleInput.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
      body.appendChild(field(L(labels, "tagRowTitle", "Row title"), "", titleInput));

      // Tags
      const tagChips = h("div", { cls: "tagrows-chips" });
      const tagCombo = createCombo({
        labels,
        placeholder: L(labels, "tagRowAddTag", "Add a tag…"),
        ariaLabel: L(labels, "tagRowTags", "Tags"),
        load: loadLibraryTags,
        selected: () => row.tags,
        show: () => row.show,
        footer: (shown, matched, total, q) => fill(
          q ? L(labels, "tagRowTagsFooterQ", "{shown} of {matched} tags containing “{q}” · {total} in the library")
            : L(labels, "tagRowTagsFooter", "{shown} of {total} tags in the library, most used first"),
          { shown, matched, total: total.toLocaleString(), q }),
        toggle: (value) => { toggleIn(row.tags, value); renderChips(tagChips, row.tags, renderTagsAgain); refreshCount(); renderHead(); save(); }
      });
      const renderTagsAgain = () => { renderChips(tagChips, row.tags, renderTagsAgain); tagCombo.sync(); refreshCount(); renderHead(); save(); };
      renderChips(tagChips, row.tags, renderTagsAgain);
      tagChips.appendChild(tagCombo.el);
      body.appendChild(field(L(labels, "tagRowTags", "Tags"), L(labels, "tagRowTagsHint", "A title needs any one of them."), tagChips));

      // Genres
      const genreChips = h("div", { cls: "tagrows-chips" });
      const genreCombo = createCombo({
        labels,
        placeholder: L(labels, "tagRowAddGenre", "Add a genre…"),
        ariaLabel: L(labels, "tagRowGenres", "Only these genres"),
        load: loadLibraryGenres,
        selected: () => row.genres,
        show: () => row.show,
        footer: null,
        toggle: (value) => { toggleIn(row.genres, value); renderChips(genreChips, row.genres, renderGenresAgain); refreshCount(); save(); }
      });
      const renderGenresAgain = () => { renderChips(genreChips, row.genres, renderGenresAgain); genreCombo.sync(); refreshCount(); save(); };
      renderChips(genreChips, row.genres, renderGenresAgain);
      genreChips.appendChild(genreCombo.el);
      body.appendChild(field(L(labels, "tagRowGenres", "Only these genres"), L(labels, "tagRowGenresHint", "Optional. Leave empty for any genre."), genreChips));

      // Show
      body.appendChild(field(L(labels, "tagRowShow", "Show"), "", segmented([
        ["Movie", L(labels, "tagRowMovies", "Movies")], ["Series", L(labels, "tagRowShows", "Shows")], ["Both", L(labels, "tagRowBoth", "Both")]
      ], () => row.show, (v) => { row.show = v; tagCombo.sync(); genreCombo.sync(); refreshCount(); renderHead(); save(); }, L(labels, "tagRowShow", "Show"))));

      // Order
      body.appendChild(field(L(labels, "tagRowOrder", "Order"), L(labels, "tagRowOrderHint", "Random picks a new mix each day."), segmented([
        ["random", L(labels, "tagRowRandom", "Random")], ["rating", L(labels, "tagRowTopRated", "Top 10 by rating")]
      ], () => row.order, (v) => { row.order = v; renderHead(); save(); }, L(labels, "tagRowOrder", "Order"))));

      // Season
      const season = createSeasonPicker({ labels, row, onChange: () => { renderHead(); save(); } });
      const seasonField = field(L(labels, "tagRowSeason", "Season"), L(labels, "tagRowSeasonHint", "Hidden outside these dates."), season.el);
      seasonField.classList.add("tagrows-field--season");
      body.appendChild(seasonField);

      body.appendChild(h("div", { cls: "tagrows-actions" }, [
        countLine,
        button("tagrows-btn tagrows-delete", {
          label: L(labels, "tagRowDelete", "Delete row"),
          onClick: () => {
            rows = rows.filter((r) => r.id !== row.id);
            expanded.delete(row.id);
            renderList();
          }
        })
      ]));
      refreshCount();
    }

    if (isOpen()) buildBody();
    renderHead();
    if (!isOpen() && row.tags.length) {
      countMatches(row, { withGenres: true }).then((n) => { if (n !== null) { lastCount = n; renderHead(); } });
    }
    return card;
  }

  function toggleIn(list, value) {
    const i = list.findIndex((v) => v.toLowerCase() === String(value).toLowerCase());
    if (i >= 0) list.splice(i, 1); else list.push(value);
  }

  function renderChips(wrap, values, after) {
    wrap.querySelectorAll(".tagrows-chip").forEach((c) => c.remove());
    const anchor = wrap.querySelector(".tagrows-combo");
    for (const value of values) {
      const chip = h("span", { cls: "tagrows-chip" }, [h("span", { text: value })]);
      chip.appendChild(button("tagrows-chip-x", {
        icon: ICON.x,
        title: fill(L(labels, "tagRowRemove", "Remove {name}"), { name: value }),
        onClick: () => {
          const i = values.indexOf(value);
          if (i >= 0) values.splice(i, 1);
          after();
        }
      }));
      wrap.insertBefore(chip, anchor);
    }
  }

  function segmented(options, get, set, ariaLabel) {
    const group = h("div", { cls: "tagrows-seg", attrs: { role: "group", "aria-label": ariaLabel } });
    const sync = () => group.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.value === get() ? "true" : "false"));
    for (const [value, text] of options) {
      const b = button("tagrows-seg-btn", { label: text, attrs: { "data-value": value } });
      b.addEventListener("click", () => { set(value); sync(); });
      group.appendChild(b);
    }
    sync();
    return group;
  }

  renderList();
  return section;
}

// A search box over the library's tags or genres, with counts, that toggles values in and out of the row.
function createCombo({ labels, placeholder, ariaLabel, load, selected, show, footer, toggle }) {
  const id = "tagrows-dd-" + Math.random().toString(36).slice(2, 8);
  const input = h("input", {
    cls: "tagrows-input tagrows-search",
    attrs: { type: "text", autocomplete: "off", spellcheck: "false", placeholder, role: "combobox", "aria-label": ariaLabel, "aria-expanded": "false", "aria-controls": id, "aria-autocomplete": "list" }
  });
  const box = h("label", { cls: "tagrows-searchbox", html: ICON.search }, [input]);
  const dd = h("div", { cls: "tagrows-dd", attrs: { id, role: "listbox", "aria-multiselectable": "true" } });
  dd.hidden = true;
  const el = h("div", { cls: "tagrows-combo" }, [box, dd]);
  let data = null;
  let active = -1;
  let options = [];

  async function open() {
    dd.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (!data) {
      dd.textContent = "";
      dd.appendChild(h("div", { cls: "tagrows-dd-foot", text: L(labels, "tagRowLoading", "Loading…") }));
      try { data = await load(); } catch {
        dd.textContent = "";
        dd.appendChild(h("div", { cls: "tagrows-dd-foot", text: L(labels, "tagRowLoadFailed", "Could not load the list.") }));
        return;
      }
    }
    render();
  }
  function close() {
    dd.hidden = true;
    input.setAttribute("aria-expanded", "false");
    active = -1;
  }
  function render() {
    if (!data || dd.hidden) return;
    const q = input.value.trim().toLowerCase();
    const sel = new Set(selected().map((v) => v.toLowerCase()));
    const kind = show();
    const pool = data.items.filter((o) => countFor(o, kind) > 0 || sel.has(o.name.toLowerCase()));
    const matched = q ? pool.filter((o) => o.name.toLowerCase().includes(q)) : pool;
    matched.sort((a, b) => (countFor(b, kind) - countFor(a, kind)) || a.name.localeCompare(b.name));
    options = matched.slice(0, COMBO_LIMIT);
    dd.textContent = "";
    if (!options.length) {
      dd.appendChild(h("div", { cls: "tagrows-dd-foot", text: L(labels, "tagRowNoMatch", "Nothing matches.") }));
      return;
    }
    options.forEach((o, i) => {
      const on = sel.has(o.name.toLowerCase());
      const opt = h("div", {
        cls: "tagrows-opt" + (on ? " is-on" : "") + (i === active ? " is-active" : ""),
        attrs: { role: "option", "aria-selected": on ? "true" : "false", id: `${id}-${i}` }
      }, [
        h("span", { cls: "tagrows-box", html: on ? ICON.check : "" }),
        h("span", { cls: "tagrows-opt-name", text: o.name }),
        h("span", { cls: "tagrows-opt-n", text: countFor(o, kind) })
      ]);
      opt.addEventListener("mousedown", (e) => e.preventDefault());
      opt.addEventListener("click", () => { active = i; toggle(o.name); render(); });
      dd.appendChild(opt);
    });
    if (footer) dd.appendChild(h("div", { cls: "tagrows-dd-foot", text: footer(options.length, matched.length, pool.length, input.value.trim()) }));
    input.setAttribute("aria-activedescendant", active >= 0 ? `${id}-${active}` : "");
  }
  input.addEventListener("focus", open);
  input.addEventListener("input", () => { active = -1; if (dd.hidden) open(); else render(); });
  input.addEventListener("blur", () => setTimeout(close, 120));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // a bare Enter would submit (save) the whole settings form
      if (active >= 0 && options[active]) { toggle(options[active].name); render(); }
      return;
    }
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (dd.hidden) { open(); return; }
      const n = options.length;
      if (!n) return;
      active = e.key === "ArrowDown" ? (active + 1) % n : (active <= 0 ? n - 1 : active - 1);
      render();
      dd.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
    }
  });
  return { el, sync: render };
}

// The Season field: a date button that drops a two-month range calendar.
function createSeasonPicker({ labels, row, onChange }) {
  const wrap = h("div", { cls: "tagrows-season" });
  const trigger = button("tagrows-date", { attrs: { "aria-haspopup": "dialog", "aria-expanded": "false" } });
  const pop = h("div", { cls: "tagrows-pop", attrs: { role: "dialog", "aria-label": L(labels, "tagRowSeasonPick", "Show this row from…to") } });
  pop.hidden = true;
  wrap.append(trigger, pop);

  const today = new Date();
  let view = (() => { const d = parseYmd(row.season?.from) || today; return new Date(d.getFullYear(), d.getMonth(), 1); })();
  let pickingEnd = false;
  let everyYear = row.season ? row.season.everyYear !== false : true;

  function label() {
    trigger.innerHTML = ICON.cal;
    const text = row.season
      ? formatTagRowSeason({ ...row.season, everyYear: true }, { everyYear: "" }).replace(/ · $/, "")
      : L(labels, "tagRowAllYear", "All year");
    trigger.appendChild(h("span", { cls: "tagrows-date-text", text: row.season && row.season.everyYear === false ? formatTagRowSeason(row.season) : text }));
    if (row.season && row.season.everyYear !== false) trigger.appendChild(h("em", { text: L(labels, "tagRowEveryYear", "every year") }));
    trigger.insertAdjacentHTML("beforeend", pop.hidden ? ICON.down : ICON.up);
    trigger.setAttribute("aria-expanded", pop.hidden ? "false" : "true");
  }

  function setSeason(season) {
    row.season = season;
    onChange();
    label();
    renderCal();
  }

  function month(year, mon) {
    const first = new Date(year, mon, 1);
    const lead = first.getDay();
    const days = new Date(year, mon + 1, 0).getDate();
    const grid = h("div", { cls: "tagrows-cg", attrs: { role: "grid" } });
    WEEKDAYS.forEach((w) => grid.appendChild(h("span", { cls: "tagrows-cw", text: w, attrs: { "aria-hidden": "true" } })));
    for (let i = 0; i < lead; i++) grid.appendChild(h("span", { cls: "tagrows-cd is-blank" }));
    const probe = row.season ? { season: { ...row.season, everyYear } } : null;
    for (let d = 1; d <= days; d++) {
      const date = new Date(year, mon, d);
      const key = ymd(date);
      const col = (lead + d - 1) % 7;
      const cls = ["tagrows-cd"];
      const isFrom = row.season && (everyYear ? key.slice(5) === row.season.from.slice(5) : key === row.season.from);
      const isTo = row.season && !pickingEnd && (everyYear ? key.slice(5) === row.season.to.slice(5) : key === row.season.to);
      if (probe && !pickingEnd && isTagRowInSeason(probe, date)) cls.push("is-in");
      if (isFrom) cls.push("is-from");
      if (isTo) cls.push("is-to");
      if (col === 0) cls.push("is-rl");
      if (col === 6) cls.push("is-rr");
      if (key === ymd(today)) cls.push("is-today");
      const b = h("button", {
        cls: cls.join(" "),
        text: d,
        attrs: { type: "button", "aria-label": date.toDateString(), "aria-pressed": (isFrom || isTo) ? "true" : "false" }
      });
      b.addEventListener("click", () => {
        if (!pickingEnd || !row.season) {
          pickingEnd = true;
          setSeason({ from: key, to: key, everyYear });
        } else {
          let from = row.season.from;
          let to = key;
          if (!everyYear && to < from) [from, to] = [to, from];
          pickingEnd = false;
          setSeason({ from, to, everyYear });
        }
      });
      grid.appendChild(b);
    }
    return h("div", { cls: "tagrows-mo" }, [h("div", { cls: "tagrows-mo-h", text: `${MONTHS[mon]} ${year}` }), grid]);
  }

  const months = h("div", { cls: "tagrows-mos" });
  const summary = h("span", { cls: "tagrows-sum" });
  const yearSwitch = button("tagrows-switch", { title: L(labels, "tagRowEveryYearSwitch", "Every year"), attrs: { role: "switch", "aria-checked": everyYear ? "true" : "false" } });
  yearSwitch.addEventListener("click", () => {
    everyYear = !everyYear;
    yearSwitch.setAttribute("aria-checked", everyYear ? "true" : "false");
    if (row.season) setSeason({ ...row.season, everyYear }); else renderCal();
  });

  function renderCal() {
    months.textContent = "";
    const second = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    months.append(month(view.getFullYear(), view.getMonth()), month(second.getFullYear(), second.getMonth()));
    summary.textContent = pickingEnd
      ? L(labels, "tagRowPickEnd", "Now pick the last day")
      : (row.season ? formatTagRowSeason({ ...row.season, everyYear: true }, { everyYear: "" }).replace(/ · $/, "") : L(labels, "tagRowAllYear", "All year"));
  }

  pop.append(
    h("div", { cls: "tagrows-pop-h" }, [
      h("b", { text: L(labels, "tagRowSeasonPick", "Show this row from…to") }),
      h("div", { cls: "tagrows-nav" }, [
        button("tagrows-iconbtn", { icon: ICON.prev, title: L(labels, "tagRowPrevMonth", "Previous month"), onClick: () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCal(); } }),
        button("tagrows-iconbtn", { icon: ICON.next, title: L(labels, "tagRowNextMonth", "Next month"), onClick: () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCal(); } })
      ])
    ]),
    months,
    h("div", { cls: "tagrows-pop-f" }, [
      yearSwitch,
      h("span", { cls: "tagrows-pop-l", text: L(labels, "tagRowEveryYearSwitch", "Every year") }),
      summary,
      h("span", { cls: "tagrows-grow" }),
      button("tagrows-btn", { label: L(labels, "tagRowClear", "Clear"), onClick: () => { pickingEnd = false; setSeason(null); } }),
      button("tagrows-btn tagrows-btn--primary", { label: L(labels, "tagRowDone", "Done"), onClick: () => close() })
    ])
  );

  function open() {
    pop.hidden = false;
    renderCal();
    label();
    setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
  }
  function close() {
    if (pickingEnd && row.season) { pickingEnd = false; renderCal(); }
    pop.hidden = true;
    label();
    document.removeEventListener("pointerdown", outside, true);
  }
  function outside(e) { if (!wrap.contains(e.target)) close(); }
  trigger.addEventListener("click", () => (pop.hidden ? open() : close()));
  pop.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); trigger.focus(); } });

  label();
  return { el: wrap };
}

function ensureTagRowsStyles() {
  if (document.getElementById("jms-tagrows-css")) return;
  const style = document.createElement("style");
  style.id = "jms-tagrows-css";
  // Colours come from MonWUI's --settings-* variables, so the editor follows MonWUI's themes and Lumen §13 (which
  // redeclares them); fonts fall back from Lumen's tokens to the settings font.
  style.textContent = `
html body #settings-modal .tagrows-section { --tr-serif: var(--lumen-serif, var(--settings-font, inherit)); --tr-mono: var(--lumen-mono, ui-monospace, Menlo, monospace); --tr-line: var(--settings-border, rgba(127,127,127,.2)); --tr-line-strong: var(--settings-border-strong, rgba(127,127,127,.35)); --tr-on: var(--settings-accent, #29c4d4); --tr-on-text: #0a0a0f; --tr-text: var(--settings-text, inherit); --tr-muted: var(--settings-muted, rgba(127,127,127,.9)); }
html body #settings-modal .tagrows-bar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin: 4px 0 10px; }
html body #settings-modal .tagrows-intro { margin: 6px 0 0; font-size: 14px; line-height: 1.5; color: var(--tr-muted); }
html body #settings-modal .tagrows-empty { margin: 8px 0; font-size: 14px; color: var(--tr-muted); }
html body #settings-modal .tagrows-list { display: flex; flex-direction: column; gap: 12px; }
html body #settings-modal .tagrows-card { border: 1px solid var(--tr-line-strong); border-radius: 14px; background: var(--settings-card, transparent); color: var(--tr-text); }
html body #settings-modal .tagrows-card.is-dragging { opacity: .55; }
html body #settings-modal .tagrows-head { display: flex; align-items: center; gap: 14px; padding: 14px 16px; min-height: 60px; box-sizing: border-box; }
html body #settings-modal .tagrows-grow { flex: 1; }
html body #settings-modal .tagrows-name { font: 400 24px/1.05 var(--tr-serif); letter-spacing: -0.01em; color: var(--tr-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40%; }
html body #settings-modal .tagrows-card.is-off .tagrows-name { color: var(--tr-muted); }
html body #settings-modal .tagrows-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0; font: 400 12px/1.4 var(--tr-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--tr-muted); }
html body #settings-modal .tagrows-meta i { display: inline-block; width: 5px; height: 5px; margin: 0 8px; border-radius: 999px; background: currentColor; opacity: .5; }
html body #settings-modal button.tagrows-handle, html body #settings-modal button.tagrows-iconbtn { flex: none; display: grid; place-items: center; width: 32px; height: 32px; padding: 0; margin: 0; border: 1px solid transparent; border-radius: 999px; background: none; color: var(--tr-muted) !important; cursor: pointer; box-shadow: none; min-width: 0; min-height: 0; }
html body #settings-modal button.tagrows-handle { cursor: grab; width: 24px; }
html body #settings-modal button.tagrows-handle svg { width: 18px; height: 18px; }
html body #settings-modal button.tagrows-iconbtn svg { width: 16px; height: 16px; }
html body #settings-modal button.tagrows-iconbtn:hover, html body #settings-modal button.tagrows-handle:hover { color: var(--tr-text) !important; }
html body #settings-modal button.tagrows-iconbtn:focus-visible, html body #settings-modal button.tagrows-handle:focus-visible, html body #settings-modal button.tagrows-switch:focus-visible, html body #settings-modal button.tagrows-seg-btn:focus-visible, html body #settings-modal button.tagrows-date:focus-visible, html body #settings-modal button.tagrows-cd:focus-visible, html body #settings-modal button.tagrows-btn:focus-visible, html body #settings-modal button.tagrows-chip-x:focus-visible { outline: 2px solid var(--tr-on); outline-offset: 2px; }
html body #settings-modal button.tagrows-switch { flex: none; position: relative; width: 38px; height: 22px; padding: 0; margin: 0; border: 0; border-radius: 999px; background: rgba(127,127,127,.3); cursor: pointer; min-width: 0; min-height: 0; box-shadow: none; }
html body #settings-modal button.tagrows-switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 999px; background: #f4f4f7; opacity: .75; transition: left .15s ease; }
html body #settings-modal button.tagrows-switch[aria-checked="true"] { background: var(--tr-on); }
html body #settings-modal button.tagrows-switch[aria-checked="true"]::after { left: 19px; background: var(--tr-on-text); opacity: 1; }
html body #settings-modal .tagrows-body { padding: 2px 16px 14px 54px; border-top: 1px solid var(--tr-line); }
html body #settings-modal .tagrows-body[hidden] { display: none; }
html body #settings-modal .tagrows-field { display: flex; align-items: flex-start; gap: 20px; padding: 14px 0; border-bottom: 1px solid var(--tr-line); }
html body #settings-modal .tagrows-label { flex: 0 0 190px; padding-top: 7px; }
html body #settings-modal .tagrows-l { font-size: 15px; line-height: 1.35; color: var(--tr-text); }
html body #settings-modal .tagrows-d { margin-top: 4px; font-size: 13px; line-height: 1.5; color: var(--tr-muted); }
html body #settings-modal .tagrows-control { flex: 1; min-width: 0; display: flex; justify-content: flex-end; }
html body #settings-modal input.tagrows-input[type="text"] { box-sizing: border-box; height: 38px; margin: 0; padding: 0 12px; border: 1px solid var(--settings-input-border, var(--tr-line-strong)); border-radius: 8px; background: var(--settings-input-bg, transparent); color: var(--tr-text) !important; font: 400 15px/1 var(--settings-font, inherit); box-shadow: none; }
html body #settings-modal input.tagrows-title-input[type="text"] { width: min(320px, 100%); }
html body #settings-modal input.tagrows-input[type="text"]:focus { outline: none; border-color: var(--tr-on); box-shadow: var(--settings-ring, none); }
html body #settings-modal .tagrows-chips { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 8px; }
html body #settings-modal .tagrows-chip { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 5px 0 13px; border-radius: 999px; background: var(--settings-accent-soft, rgba(127,127,127,.14)); border: 1px solid var(--tr-line-strong); font-size: 14px; color: var(--tr-text); }
html body #settings-modal button.tagrows-chip-x { display: grid; place-items: center; width: 22px; height: 22px; padding: 0; margin: 0; border: 0; border-radius: 999px; background: rgba(127,127,127,.18); color: var(--tr-text) !important; cursor: pointer; min-width: 0; min-height: 0; box-shadow: none; }
html body #settings-modal button.tagrows-chip-x svg { width: 12px; height: 12px; }
html body #settings-modal .tagrows-combo { position: relative; }
html body #settings-modal label.tagrows-searchbox { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px; border: 1px solid var(--settings-input-border, var(--tr-line-strong)); border-radius: 8px; background: var(--settings-input-bg, transparent); color: var(--tr-muted) !important; cursor: text; margin: 0; }
html body #settings-modal label.tagrows-searchbox svg { width: 15px; height: 15px; flex: none; }
html body #settings-modal label.tagrows-searchbox:focus-within { border-color: var(--tr-on); }
html body #settings-modal input.tagrows-search[type="text"] { height: 34px; width: 150px; padding: 0; border: 0; background: none; box-shadow: none; }
html body #settings-modal input.tagrows-search[type="text"]:focus { box-shadow: none; }
html body #settings-modal .tagrows-dd { position: absolute; z-index: 30; right: 0; top: calc(100% + 6px); width: min(460px, 86vw); max-height: 360px; overflow: auto; padding: 6px; border: 1px solid var(--tr-line-strong); border-radius: 12px; background: var(--settings-input-option-bg, #15151c); box-shadow: var(--settings-shadow, 0 24px 50px -15px rgba(0,0,0,.7)); text-align: left; }
html body #settings-modal .tagrows-dd[hidden] { display: none; }
html body #settings-modal .tagrows-opt { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 8px; font-size: 15px; line-height: 1.2; color: var(--tr-text); cursor: pointer; }
html body #settings-modal .tagrows-opt:hover, html body #settings-modal .tagrows-opt.is-active { background: rgba(127,127,127,.12); }
html body #settings-modal .tagrows-box { flex: none; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid var(--tr-muted); }
html body #settings-modal .tagrows-opt.is-on .tagrows-box { background: var(--tr-on); border-color: var(--tr-on); color: var(--tr-on-text); }
html body #settings-modal .tagrows-box svg { width: 13px; height: 13px; }
html body #settings-modal .tagrows-opt-name { flex: 1; overflow-wrap: anywhere; }
html body #settings-modal .tagrows-opt-n { font: 400 13px/1 var(--tr-mono); color: var(--tr-muted); }
html body #settings-modal .tagrows-dd-foot { padding: 8px 12px 6px; font: 400 12px/1.4 var(--tr-mono); color: var(--tr-muted); }
html body #settings-modal .tagrows-seg { display: inline-flex; padding: 3px; border-radius: 999px; border: 1px solid var(--tr-line-strong); }
html body #settings-modal button.tagrows-seg-btn { margin: 0; padding: 8px 16px; min-width: 0; min-height: 0; border: 0; border-radius: 999px; background: none; color: var(--tr-muted) !important; font: 400 14px/1 var(--settings-font, inherit); cursor: pointer; box-shadow: none; }
html body #settings-modal button.tagrows-seg-btn[aria-pressed="true"] { background: var(--tr-on); color: var(--tr-on-text) !important; font-weight: 500; }
html body #settings-modal .tagrows-season { position: relative; display: flex; justify-content: flex-end; }
html body #settings-modal button.tagrows-date { display: inline-flex; align-items: center; gap: 10px; height: 38px; margin: 0; padding: 0 12px 0 14px; min-width: 0; min-height: 0; border: 1px solid var(--tr-line-strong); border-radius: 8px; background: var(--settings-input-bg, transparent); color: var(--tr-text) !important; font: 400 14px/1 var(--settings-font, inherit); cursor: pointer; box-shadow: none; }
html body #settings-modal button.tagrows-date svg { width: 16px; height: 16px; color: var(--tr-muted) !important; }
html body #settings-modal button.tagrows-date em { font: 400 12px/1 var(--tr-mono); font-style: normal; letter-spacing: .06em; text-transform: uppercase; color: var(--tr-muted) !important; }
html body #settings-modal .tagrows-pop { position: absolute; z-index: 30; right: 0; top: calc(100% + 8px); width: 620px; max-width: 86vw; box-sizing: border-box; padding: 18px 20px 16px; border: 1px solid var(--tr-line-strong); border-radius: 14px; background: var(--settings-input-option-bg, #15151c); box-shadow: var(--settings-shadow, 0 30px 60px -15px rgba(0,0,0,.75)); text-align: left; }
html body #settings-modal .tagrows-pop[hidden] { display: none; }
html body #settings-modal .tagrows-pop-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
html body #settings-modal .tagrows-pop-h b { font: 400 21px/1 var(--tr-serif); font-weight: 400; color: var(--tr-text); }
html body #settings-modal .tagrows-nav { display: flex; gap: 6px; }
html body #settings-modal .tagrows-nav button.tagrows-iconbtn { border-color: var(--tr-line-strong); color: var(--tr-text) !important; }
html body #settings-modal .tagrows-mos { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
html body #settings-modal .tagrows-mo-h { margin-bottom: 8px; font: 500 12px/1.2 var(--settings-font, inherit); letter-spacing: .2em; text-transform: uppercase; color: var(--tr-muted); }
html body #settings-modal .tagrows-cg { display: grid; grid-template-columns: repeat(7, 1fr); row-gap: 4px; }
html body #settings-modal .tagrows-cw { height: 24px; display: grid; place-items: center; font: 500 11px/1 var(--tr-mono); color: var(--tr-muted); }
html body #settings-modal button.tagrows-cd { position: relative; height: 36px; margin: 0; padding: 0; min-width: 0; min-height: 0; border: 0; border-radius: 0; background: none; color: var(--tr-text) !important; font: 400 14px/1 var(--settings-font, inherit); cursor: pointer; box-shadow: none; }
html body #settings-modal button.tagrows-cd.is-blank { cursor: default; }
html body #settings-modal button.tagrows-cd:hover:not(.is-blank):not(.is-in):not(.is-from):not(.is-to) { background: rgba(127,127,127,.16); border-radius: 999px; }
html body #settings-modal button.tagrows-cd.is-in { background: var(--settings-accent-soft, rgba(127,127,127,.18)); }
html body #settings-modal button.tagrows-cd.is-in.is-rl { border-radius: 999px 0 0 999px; }
html body #settings-modal button.tagrows-cd.is-in.is-rr { border-radius: 0 999px 999px 0; }
html body #settings-modal button.tagrows-cd.is-from, html body #settings-modal button.tagrows-cd.is-to { background: var(--tr-on); color: var(--tr-on-text) !important; font-weight: 500; border-radius: 999px; }
html body #settings-modal button.tagrows-cd.is-today::after { content: ""; position: absolute; left: 50%; bottom: 4px; width: 4px; height: 4px; margin-left: -2px; border-radius: 999px; background: var(--lumen-accent, var(--tr-on)); }
html body #settings-modal .tagrows-pop-f { display: flex; align-items: center; gap: 12px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--tr-line); flex-wrap: wrap; }
html body #settings-modal .tagrows-pop-l { font-size: 14px; color: var(--tr-text); }
html body #settings-modal .tagrows-sum { font: 400 13px/1.3 var(--tr-mono); color: var(--tr-muted); }
html body #settings-modal button.tagrows-btn { display: inline-flex; align-items: center; gap: 8px; height: 36px; margin: 0; padding: 0 16px; min-width: 0; min-height: 0; border: 1px solid var(--tr-line-strong); border-radius: 999px; background: none; color: var(--tr-text) !important; font: 500 14px/1 var(--settings-font, inherit); cursor: pointer; box-shadow: none; white-space: nowrap; }
html body #settings-modal button.tagrows-btn svg { width: 15px; height: 15px; }
html body #settings-modal button.tagrows-btn--primary { background: var(--tr-text); border-color: var(--tr-text); color: var(--settings-input-option-bg, #0a0a0f) !important; }
html body #settings-modal button.tagrows-btn.tagrows-delete { border-color: var(--settings-danger-border, rgba(212,74,74,.6)); color: var(--settings-danger, #e07a7a) !important; }
html body #settings-modal .tagrows-actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 14px; }
html body #settings-modal .tagrows-count { font: 400 13px/1.4 var(--tr-mono); color: var(--tr-muted); }@media (max-width: 720px) {
  html body #settings-modal .tagrows-bar { flex-direction: column; }
  html body #settings-modal .tagrows-body { padding-left: 16px; }
  html body #settings-modal .tagrows-field { flex-direction: column; gap: 8px; }
  html body #settings-modal .tagrows-label { flex: none; padding-top: 0; }
  html body #settings-modal .tagrows-control, html body #settings-modal .tagrows-chips, html body #settings-modal .tagrows-season { justify-content: flex-start; }
  html body #settings-modal .tagrows-name { max-width: none; }
  html body #settings-modal .tagrows-head { flex-wrap: wrap; }
  html body #settings-modal .tagrows-mos { grid-template-columns: 1fr; }
  html body #settings-modal .tagrows-pop, html body #settings-modal .tagrows-dd { left: 0; right: auto; }}

/* Lumen §13 marks input backgrounds, borders and colours !important; the search field sits borderless inside its box. */
html body #settings-modal .tagrows-searchbox input.tagrows-search[type="text"], html body #settings-modal .tagrows-searchbox input.tagrows-search[type="text"]:hover, html body #settings-modal .tagrows-searchbox input.tagrows-search[type="text"]:focus, html body #settings-modal .tagrows-searchbox input.tagrows-search[type="text"]:focus-visible { background-color: transparent !important; border: 0 !important; box-shadow: none !important; min-height: 0; padding: 0; }
html body #settings-modal label.tagrows-searchbox { font: 400 14px/1 var(--settings-font, inherit) !important; }
html body #settings-modal button.tagrows-handle:hover, html body #settings-modal button.tagrows-iconbtn:hover, html body #settings-modal button.tagrows-chip-x:hover { background: rgba(127,127,127,.14); }
html body #settings-modal button.tagrows-cd.is-blank:hover { background: none; }
@media (max-width: 720px) {
  html body #settings-modal .tagrows-head { gap: 10px 12px; }
  html body #settings-modal .tagrows-name { flex: 1 1 auto; }
  html body #settings-modal .tagrows-grow { display: none; }
  html body #settings-modal .tagrows-meta { order: 5; flex: 1 1 100%; padding-left: 36px; }
}
`;
  document.head.appendChild(style);
}
