// Fork Zigerus (4.0.0.92): "Popular now" for the Top 10 Movies / Top 10 Series rows. Pure functions, no DOM and no network,
// so the selection can be tested on its own (scripts/monwui-bench/top10_draw_test.mjs in the homelab repo).
//
// The rows rank the signed-in user's unwatched titles by TMDb popularity (the server keeps popularity and votes per library
// title, LibraryPopularityService). A title needs TOP10_POP_MIN_VOTES votes and an average of TOP10_POP_MIN_AVERAGE to
// count, so nothing unrated or badly rated reaches a Top 10. Every day the page draws ten from the top TOP10_POP_POOL,
// weighted by rank (weight e^(-rank/6)), with a seed made of the user, the row and the local date: the same ten all day on
// every device, a different ten tomorrow. The ten are shown in popularity order. Simulated over 20,000 days: #1 is in the
// row 93% of days, #5 77%, #10 47%, #20 11%, #30 2%, and about 6 of the 10 carry over to the next day.

export const TOP10_POP_MIN_VOTES = 25;
export const TOP10_POP_MIN_AVERAGE = 6;
export const TOP10_POP_POOL = 30;
export const TOP10_POP_COUNT = 10;
export const TOP10_POP_RANK_DECAY = 6;

export function localDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function msSinceLocalMidnight(date = new Date()) {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(0, date.getTime() - midnight.getTime());
}

// FNV-1a over the seed text, then mulberry32: a small, well-mixed PRNG that gives the same sequence for the same seed.
export function seededRandom(seedText) {
  let h = 0x811c9dc5;
  const text = String(seedText ?? "");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let state = h || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Server entries -> eligible entries, most popular first. Accepts the endpoint's PascalCase or camelCase. Two library items
// with the same TMDb id (two versions of one film) count once: the first, i.e. the server's order.
export function rankPopularEntries(entries = [], { minVotes = TOP10_POP_MIN_VOTES, minAverage = TOP10_POP_MIN_AVERAGE } = {}) {
  const seenTmdb = new Set();
  const seenItem = new Set();
  const out = [];
  for (const raw of Array.isArray(entries) ? entries : []) {
    const itemId = String(raw?.itemId ?? raw?.ItemId ?? "").trim();
    const tmdbId = Number(raw?.tmdbId ?? raw?.TmdbId);
    const popularity = Number(raw?.popularity ?? raw?.Popularity);
    const voteAverage = Number(raw?.voteAverage ?? raw?.VoteAverage);
    const voteCount = Number(raw?.voteCount ?? raw?.VoteCount);
    if (!itemId || seenItem.has(itemId)) continue;
    if (!Number.isFinite(popularity) || popularity <= 0) continue;
    if (!Number.isFinite(voteCount) || voteCount < minVotes) continue;
    if (!Number.isFinite(voteAverage) || voteAverage < minAverage) continue;
    if (Number.isFinite(tmdbId) && tmdbId > 0) {
      if (seenTmdb.has(tmdbId)) continue;
      seenTmdb.add(tmdbId);
    }
    seenItem.add(itemId);
    out.push({ itemId, tmdbId, popularity, voteAverage, voteCount });
  }
  out.sort((a, b) => b.popularity - a.popularity);
  return out;
}

// ranked: eligible entries (or items) in rank order. Returns up to `count` of them, still in rank order.
// Efraimidis-Spirakis: each candidate gets key u^(1/w) and the largest keys win, so a high-ranked title is drawn far more
// often than one near the bottom of the pool, but nothing in the pool is shut out.
export function drawDailyTop10(ranked = [], { seed = "", count = TOP10_POP_COUNT, pool = TOP10_POP_POOL, decay = TOP10_POP_RANK_DECAY } = {}) {
  const candidates = (Array.isArray(ranked) ? ranked : []).slice(0, Math.max(0, pool | 0));
  if (candidates.length <= count) return candidates.slice();
  const random = seededRandom(seed);
  const keyed = candidates.map((entry, index) => {
    const weight = Math.exp(-index / decay);
    const u = Math.max(Number.EPSILON, random());
    return { entry, index, key: Math.pow(u, 1 / weight) };
  });
  keyed.sort((a, b) => b.key - a.key);
  return keyed
    .slice(0, count)
    .sort((a, b) => a.index - b.index)
    .map((x) => x.entry);
}
