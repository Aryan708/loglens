/**
 * Analytics over parsed log entries: summary stats, time-bucketed counts,
 * statistical anomaly detection and recurring error patterns.
 * Pure functions with no I/O, so the same code runs in the browser and in Lambda.
 */
import { LEVELS, parseLog } from './parser.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const NICE_BUCKETS = [
  SECOND, 5 * SECOND, 10 * SECOND, 30 * SECOND,
  MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE,
  HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, 24 * HOUR,
];

const isProblem = (level) => level === 'ERROR' || level === 'FATAL';

export function emptyLevelCounts() {
  return Object.fromEntries(LEVELS.map((level) => [level, 0]));
}

export function summarize(entries) {
  const byLevel = emptyLevelCounts();
  const bySource = {};
  let first = null;
  let last = null;

  for (const entry of entries) {
    byLevel[entry.level] = (byLevel[entry.level] ?? 0) + 1;
    if (entry.source) bySource[entry.source] = (bySource[entry.source] ?? 0) + 1;
    if (entry.timestamp) {
      if (!first || entry.timestamp < first) first = entry.timestamp;
      if (!last || entry.timestamp > last) last = entry.timestamp;
    }
  }

  const problems = byLevel.ERROR + byLevel.FATAL;
  const topSources = Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source, count]) => ({ source, count }));

  return {
    total: entries.length,
    byLevel,
    errorCount: problems,
    warnCount: byLevel.WARN,
    errorRate: entries.length ? problems / entries.length : 0,
    firstTimestamp: first,
    lastTimestamp: last,
    topSources,
  };
}

/** Chooses a "nice" bucket size that splits the time span into about `target` buckets. */
export function chooseBucketSize(spanMs, target = 30) {
  const ideal = spanMs / target;
  return NICE_BUCKETS.find((size) => size >= ideal) ?? NICE_BUCKETS[NICE_BUCKETS.length - 1];
}

/** Groups timestamped entries into fixed-width time buckets with per-level counts. */
export function bucketize(entries, bucketMs) {
  const timed = entries.filter((e) => e.timestamp);
  if (timed.length === 0) return { bucketMs: bucketMs ?? MINUTE, buckets: [] };

  const times = timed.map((e) => Date.parse(e.timestamp));
  const min = Math.min(...times);
  const max = Math.max(...times);
  const size = bucketMs ?? chooseBucketSize(max - min);
  const start = Math.floor(min / size) * size;
  const count = Math.floor((max - start) / size) + 1;

  const buckets = Array.from({ length: count }, (_, i) => ({
    start: new Date(start + i * size).toISOString(),
    total: 0,
    counts: emptyLevelCounts(),
  }));

  timed.forEach((entry, i) => {
    const bucket = buckets[Math.floor((times[i] - start) / size)];
    bucket.total += 1;
    bucket.counts[entry.level] += 1;
  });

  return { bucketMs: size, buckets };
}

/**
 * Flags time buckets whose error count is unusually high, using a z-score
 * (how many standard deviations a value is above the mean).
 * `minCount` stops a jump from 0 to 1 error being reported as a spike.
 */
export function detectAnomalies(buckets, { threshold = 2, minCount = 3 } = {}) {
  if (buckets.length < 3) return [];
  const series = buckets.map((b) => b.counts.ERROR + b.counts.FATAL);
  const mean = series.reduce((sum, v) => sum + v, 0) / series.length;
  const variance = series.reduce((sum, v) => sum + (v - mean) ** 2, 0) / series.length;
  const std = Math.sqrt(variance);
  if (std === 0) return [];

  return buckets
    .map((bucket, i) => ({
      start: bucket.start,
      errorCount: series[i],
      zScore: Number(((series[i] - mean) / std).toFixed(2)),
    }))
    .filter((b) => b.zScore >= threshold && b.errorCount >= minCount)
    .sort((a, b) => b.zScore - a.zScore);
}

/**
 * Turns a message into a template by masking the variable parts, so that
 * "Timeout after 3000ms for order 8812" and "Timeout after 5000ms for order 17"
 * are counted as the same recurring problem.
 */
export function toTemplate(message) {
  return String(message)
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<UUID>')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '<IP>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<HEX>')
    .replace(/"[^"]*"|'[^']*'/g, '<STR>')
    .replace(/\b\d+(?:\.\d+)?(ms|s|kb|mb|gb|%)?\b/gi, (_, unit) => `<NUM>${unit ?? ''}`)
    .replace(/\s+/g, ' ')
    .trim();
}

export function topErrorPatterns(entries, limit = 5) {
  const groups = new Map();
  for (const entry of entries) {
    if (!isProblem(entry.level)) continue;
    const template = toTemplate(entry.message);
    const group = groups.get(template) ?? { template, count: 0, example: entry.message, sources: new Set() };
    group.count += 1;
    if (entry.source) group.sources.add(entry.source);
    groups.set(template, group);
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((g) => ({ template: g.template, count: g.count, example: g.example, sources: [...g.sources] }));
}

/** Full pipeline used by the browser demo mode: raw text in, analysis out. */
export function analyzeLog(text, options = {}) {
  const { entries, formats, truncated } = parseLog(text, options);
  const { bucketMs, buckets } = bucketize(entries, options.bucketMs);
  return {
    entries,
    formats,
    truncated,
    summary: summarize(entries),
    bucketMs,
    buckets,
    anomalies: detectAnomalies(buckets, options),
    patterns: topErrorPatterns(entries),
  };
}
