/** Pure helpers for filtering, sorting and formatting log entries in the UI. */

export const LEVEL_ORDER = { FATAL: 0, ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4, TRACE: 5, UNKNOWN: 6 };

/**
 * @param {object[]} entries
 * @param {{ levels?: string[], query?: string, source?: string, from?: string|null, to?: string|null }} filters
 */
export function filterEntries(entries, { levels = [], query = '', source = '', from = null, to = null } = {}) {
  const needle = query.trim().toLowerCase();
  const levelSet = new Set(levels);

  return entries.filter((entry) => {
    if (levelSet.size > 0 && !levelSet.has(entry.level)) return false;
    if (source && entry.source !== source) return false;
    if (from && (!entry.timestamp || entry.timestamp < from)) return false;
    if (to && (!entry.timestamp || entry.timestamp >= to)) return false;
    if (needle) {
      const haystack = `${entry.message} ${entry.source ?? ''} ${entry.details ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

const comparators = {
  timestamp: (a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? '') || a.id - b.id,
  level: (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.id - b.id,
  source: (a, b) => (a.source ?? '').localeCompare(b.source ?? '') || a.id - b.id,
  lineNumber: (a, b) => a.lineNumber - b.lineNumber,
};

export function sortEntries(entries, key = 'lineNumber', direction = 'asc') {
  const compare = comparators[key] ?? comparators.lineNumber;
  const sorted = [...entries].sort(compare);
  return direction === 'desc' ? sorted.reverse() : sorted;
}

export function paginate(items, page, pageSize) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  return { page: current, pageCount, items: items.slice(start, start + pageSize) };
}

export function uniqueSources(entries) {
  return [...new Set(entries.map((e) => e.source).filter(Boolean))].sort();
}

/** Times are shown in UTC so everyone looking at the same log sees the same values. */
export function formatTime(iso, { withDate = false } = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  const time = d.toISOString().slice(11, 19);
  return withDate ? `${d.toISOString().slice(0, 10)} ${time}` : time;
}

export function formatDuration(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1000)} sec`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  return `${Math.round(ms / 3_600_000)} h`;
}

export function formatPercent(ratio) {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
