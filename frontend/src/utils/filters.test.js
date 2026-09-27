import {
  filterEntries, sortEntries, paginate, uniqueSources, formatTime, formatDuration, formatPercent, formatBytes,
} from './filters.js';

const entries = [
  { id: 1, lineNumber: 1, timestamp: '2026-03-14T10:00:00.000Z', level: 'INFO', source: 'api', message: 'Started server' },
  { id: 2, lineNumber: 2, timestamp: '2026-03-14T10:01:00.000Z', level: 'ERROR', source: 'db', message: 'Connection refused', details: 'at Pool.connect' },
  { id: 3, lineNumber: 4, timestamp: '2026-03-14T10:02:00.000Z', level: 'WARN', source: 'api', message: 'Slow request' },
  { id: 4, lineNumber: 5, timestamp: null, level: 'FATAL', source: null, message: 'Out of memory' },
];

describe('filterEntries', () => {
  it('returns everything with no filters', () => {
    expect(filterEntries(entries)).toHaveLength(4);
  });

  it('filters by level, source and case-insensitive search (including stack traces)', () => {
    expect(filterEntries(entries, { levels: ['ERROR', 'FATAL'] }).map((e) => e.id)).toEqual([2, 4]);
    expect(filterEntries(entries, { source: 'api' }).map((e) => e.id)).toEqual([1, 3]);
    expect(filterEntries(entries, { query: 'SLOW' }).map((e) => e.id)).toEqual([3]);
    expect(filterEntries(entries, { query: 'pool.connect' }).map((e) => e.id)).toEqual([2]);
  });

  it('filters by a half-open time range and drops untimed entries', () => {
    const result = filterEntries(entries, { from: '2026-03-14T10:01:00.000Z', to: '2026-03-14T10:02:00.000Z' });
    expect(result.map((e) => e.id)).toEqual([2]);
  });
});

describe('sortEntries', () => {
  it('sorts by level severity and reverses for descending', () => {
    expect(sortEntries(entries, 'level').map((e) => e.level)).toEqual(['FATAL', 'ERROR', 'WARN', 'INFO']);
    expect(sortEntries(entries, 'lineNumber', 'desc').map((e) => e.id)).toEqual([4, 3, 2, 1]);
  });

  it('does not mutate the input array', () => {
    const copy = [...entries];
    sortEntries(entries, 'source');
    expect(entries).toEqual(copy);
  });
});

describe('paginate', () => {
  it('slices pages and clamps out-of-range page numbers', () => {
    const items = Array.from({ length: 23 }, (_, i) => i);
    expect(paginate(items, 3, 10)).toEqual({ page: 3, pageCount: 3, items: [20, 21, 22] });
    expect(paginate(items, 99, 10).page).toBe(3);
    expect(paginate([], 1, 10)).toEqual({ page: 1, pageCount: 1, items: [] });
  });
});

describe('formatters', () => {
  it('formats values for display', () => {
    expect(uniqueSources(entries)).toEqual(['api', 'db']);
    expect(formatTime('2026-03-14T10:01:02.000Z')).toBe('10:01:02');
    expect(formatTime('2026-03-14T10:01:02.000Z', { withDate: true })).toBe('2026-03-14 10:01:02');
    expect(formatTime(null)).toBe('—');
    expect(formatDuration(30_000)).toBe('30 sec');
    expect(formatDuration(300_000)).toBe('5 min');
    expect(formatDuration(7_200_000)).toBe('2 h');
    expect(formatPercent(0.0748)).toBe('7.5%');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
