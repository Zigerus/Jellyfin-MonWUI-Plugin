// Fork Zigerus (4.0.0.93): "Tag rows", home rows built from library tags the user picks (e.g. Christmas). Pure helpers, no
// DOM and no network, shared by config.js, the settings page and recentRows.js, and unit-tested on their own
// (scripts/monwui-bench/tagrows_test.mjs in the homelab repo).
//
// A row (stored as JSON in the per-user setting `tagRows`):
//   { id, enabled, title, tags: [..], genres: [..], show: "Movie"|"Series"|"Both", order: "random"|"rating",
//     season: null | { from: "YYYY-MM-DD", to: "YYYY-MM-DD", everyYear: true|false } }
// A title qualifies with ANY of the row's tags; when genres are set it also needs ANY of them (Jellyfin's Tags= / Genres=
// filters: OR within one, AND across). Watched titles count: a Christmas row shows the films you have seen too.
// Season: none = all year. everyYear (the default) compares month + day only and may wrap past New Year (Dec 20 -> Jan 6);
// otherwise the exact dates, once. Outside its season a row is not built at all.
// Order: "random" = a new mix each day (seeded by user, row, definition and local date: the same all day on every device),
// up to TAG_ROW_RANDOM_CARDS cards; "rating" = TMDb rating with the Top 10 vote floor, TAG_ROW_RATING_CARDS cards, shown
// with the big Top 10 numerals.

import { seededRandom, localDayKey, TOP10_POP_MIN_VOTES, TOP10_POP_MIN_AVERAGE } from "./top10Popular.js";

export const TAG_ROW_RANDOM_CARDS = 20;
export const TAG_ROW_RATING_CARDS = 10;
export const TAG_ROW_MAX_ROWS = 30;
export const TAG_ROW_MAX_TAGS = 60;

const SHOW_VALUES = new Set(["Movie", "Series", "Both"]);
const ORDER_VALUES = new Set(["random", "rating"]);
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function newTagRowId() {
  return "tr" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function cleanList(list, max) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const value = String(raw ?? "").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function validDate(value) {
  const m = DATE_RE.exec(String(value || "").trim());
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return "";
  return m[0];
}

export function normalizeTagRowSeason(season) {
  if (!season || typeof season !== "object") return null;
  let from = validDate(season.from);
  let to = validDate(season.to);
  if (!from || !to) return null;
  const everyYear = season.everyYear !== false;
  if (!everyYear && from > to) [from, to] = [to, from];
  return { from, to, everyYear };
}

export function normalizeTagRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const tags = cleanList(raw.tags, TAG_ROW_MAX_TAGS);
  const id = String(raw.id || "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || newTagRowId();
  return {
    id,
    enabled: raw.enabled !== false,
    title: String(raw.title ?? "").trim().slice(0, 80),
    tags,
    genres: cleanList(raw.genres, 30),
    show: SHOW_VALUES.has(raw.show) ? raw.show : "Movie",
    order: ORDER_VALUES.has(raw.order) ? raw.order : "random",
    season: normalizeTagRowSeason(raw.season),
  };
}

export function normalizeTagRows(value) {
  let list = value;
  if (typeof value === "string") {
    try { list = JSON.parse(value); } catch { list = []; }
  }
  const out = [];
  const ids = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const row = normalizeTagRow(raw);
    if (!row) continue;
    while (ids.has(row.id)) row.id = newTagRowId();
    ids.add(row.id);
    out.push(row);
    if (out.length >= TAG_ROW_MAX_ROWS) break;
  }
  return out;
}

function monthDay(date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isTagRowInSeason(row, date = new Date()) {
  const season = row?.season;
  if (!season) return true;
  if (season.everyYear !== false) {
    const today = monthDay(date);
    const from = season.from.slice(5);
    const to = season.to.slice(5);
    return from <= to ? (today >= from && today <= to) : (today >= from || today <= to);
  }
  const today = localDayKey(date);
  return today >= season.from && today <= season.to;
}

// Rows that get built today: switched on, at least one tag, and in season.
export function getActiveTagRows(rows, date = new Date()) {
  return normalizeTagRows(rows).filter((row) => row.enabled && row.tags.length && isTagRowInSeason(row, date));
}

// Changes whenever what the row would show changes (not its title or season), so a saved list never outlives an edit.
export function tagRowSignature(row) {
  const lower = (list) => (Array.isArray(list) ? list : []).map((v) => String(v).toLowerCase()).sort().join("|");
  return `${lower(row?.tags)}#${lower(row?.genres)}#${row?.show || "Movie"}#${row?.order || "random"}`;
}

// FNV-1a, hex: a short, stable key for a row definition (cache keys must stay short).
export function hashText(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function tagRowCacheType(row) {
  return `tag:${row?.id}:${hashText(tagRowSignature(row))}`;
}

export function tagRowIncludeTypes(row) {
  return row?.show === "Series" ? ["Series"] : row?.show === "Both" ? ["Movie", "Series"] : ["Movie"];
}

// Fisher-Yates with the shared seeded PRNG.
export function seededShuffle(list, seed) {
  const out = Array.isArray(list) ? list.slice() : [];
  const random = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function tagRowDailySeed(userId, row, date = new Date()) {
  return `${userId}|tag|${row?.id}|${tagRowSignature(row)}|${localDayKey(date)}`;
}

// items: Jellyfin items; numbers: Map(itemId lowercased without dashes -> { voteAverage, voteCount }) from the
// library-popularity endpoint. Titles TMDb rates with enough votes come first, best rating first; titles under the floor
// are dropped; titles with no TMDb numbers follow, by Jellyfin's community rating. Two items of one TMDb id count once.
export function rankTagRowByRating(items, numbers, { minVotes = TOP10_POP_MIN_VOTES, minAverage = TOP10_POP_MIN_AVERAGE } = {}) {
  const rated = [];
  const unrated = [];
  const seenTmdb = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.Id) continue;
    const key = String(item.Id).replace(/-/g, "").toLowerCase();
    const n = numbers instanceof Map ? numbers.get(key) : null;
    if (n && Number.isFinite(n.voteAverage) && Number.isFinite(n.voteCount)) {
      if (n.voteCount < minVotes || n.voteAverage < minAverage) continue;
      if (n.tmdbId) {
        const tk = `${item.Type}:${n.tmdbId}`;
        if (seenTmdb.has(tk)) continue;
        seenTmdb.add(tk);
      }
      rated.push({ item, avg: n.voteAverage, votes: n.voteCount });
    } else {
      unrated.push({ item, avg: Number(item.CommunityRating) || 0, votes: 0 });
    }
  }
  rated.sort((a, b) => (b.avg - a.avg) || (b.votes - a.votes));
  unrated.sort((a, b) => b.avg - a.avg);
  return [...rated, ...unrated].map((x) => x.item);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatTagRowSeason(season, { allYear = "All year", everyYear = "every year" } = {}) {
  if (!season) return allYear;
  const fmt = (value, withYear) => {
    const m = DATE_RE.exec(value);
    if (!m) return value;
    const label = `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
    return withYear ? `${label}, ${m[1]}` : label;
  };
  const once = season.everyYear === false;
  const text = `${fmt(season.from, once)} → ${fmt(season.to, once)}`;
  return once ? text : `${text} · ${everyYear}`;
}
