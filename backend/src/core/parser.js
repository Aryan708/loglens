/**
 * Log parsing core, shared by the React front end (demo mode) and the
 * AWS Lambda pipeline (cloud mode).
 *
 * Design pattern: Strategy. Each supported log format is a small strategy
 * object with a `name` and a `parse(line)` method. The parser tries each
 * strategy in order and uses the first that matches, so adding a new format
 * means adding one object to FORMAT_STRATEGIES. Nothing else changes.
 */

export const LEVELS = ['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'UNKNOWN'];

const LEVEL_ALIASES = {
  WARNING: 'WARN',
  CRITICAL: 'FATAL',
  CRIT: 'FATAL',
  EMERG: 'FATAL',
  ALERT: 'FATAL',
  ERR: 'ERROR',
  SEVERE: 'ERROR',
  NOTICE: 'INFO',
  INFORMATION: 'INFO',
  VERBOSE: 'DEBUG',
  FINE: 'DEBUG',
};

export function normalizeLevel(raw) {
  if (!raw) return 'UNKNOWN';
  const upper = String(raw).trim().toUpperCase();
  if (LEVELS.includes(upper)) return upper;
  return LEVEL_ALIASES[upper] ?? 'UNKNOWN';
}

/** Returns an ISO-8601 string, or null when the value is not a valid date. */
export function toIsoTimestamp(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  let value = raw;
  if (typeof value === 'number') {
    // Treat 10-digit numbers as epoch seconds, larger ones as epoch millis.
    value = value < 1e11 ? value * 1000 : value;
  } else {
    // "2026-03-14 10:22:01,123" -> "2026-03-14T10:22:01.123"
    value = String(value).trim().replace(' ', 'T').replace(',', '.');
    // No zone in the log line: treat it as UTC so results are the same in the
    // browser and in Lambda, whatever the machine's local time zone is.
    if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(value)) value += 'Z';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const LEVEL_WORD = '(TRACE|DEBUG|INFO|NOTICE|WARN|WARNING|ERROR|ERR|SEVERE|FATAL|CRITICAL|CRIT)';
const ISO_TS = '(\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}(?:[.,]\\d{1,9})?(?:Z|[+-]\\d{2}:?\\d{2})?)';

/** e.g. 2026-03-14 10:22:01,123 ERROR [payment-service] Card declined */
const standardStrategy = {
  name: 'standard',
  regex: new RegExp(`^${ISO_TS}\\s+${LEVEL_WORD}\\s+(?:\\[([^\\]]+)\\]\\s*)?(?:[:-]\\s*)?(.*)$`, 'i'),
  parse(line) {
    const m = this.regex.exec(line);
    if (!m) return null;
    return { timestamp: toIsoTimestamp(m[1]), level: normalizeLevel(m[2]), source: m[3] ?? null, message: m[4] };
  },
};

/** e.g. [2026-03-14T10:22:01Z] [ERROR] payment-service: Card declined */
const bracketedStrategy = {
  name: 'bracketed',
  regex: new RegExp(`^\\[${ISO_TS}\\]\\s*\\[${LEVEL_WORD}\\]\\s*(?:([\\w.\\-/]+):\\s+)?(.*)$`, 'i'),
  parse(line) {
    const m = this.regex.exec(line);
    if (!m) return null;
    return { timestamp: toIsoTimestamp(m[1]), level: normalizeLevel(m[2]), source: m[3] ?? null, message: m[4] };
  },
};

/** One JSON object per line, as produced by most structured loggers. */
const jsonStrategy = {
  name: 'json',
  parse(line) {
    if (!line.startsWith('{')) return null;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      return null;
    }
    if (obj === null || typeof obj !== 'object') return null;
    const message = obj.message ?? obj.msg ?? obj.event ?? '';
    return {
      timestamp: toIsoTimestamp(obj.timestamp ?? obj['@timestamp'] ?? obj.time ?? obj.ts),
      level: normalizeLevel(obj.level ?? obj.severity ?? obj.levelname),
      source: obj.service ?? obj.logger ?? obj.module ?? obj.source ?? null,
      message: typeof message === 'string' ? message : JSON.stringify(message),
    };
  },
};

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Classic syslog: Mar 14 10:22:01 web-01 nginx[812]: upstream timed out */
const syslogStrategy = {
  name: 'syslog',
  regex: /^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\S+)\s+([\w.\-/]+)(?:\[\d+\])?:\s*(.*)$/,
  parse(line, options) {
    const m = this.regex.exec(line);
    if (!m) return null;
    const month = MONTHS[m[1].toLowerCase()];
    if (month === undefined) return null;
    const year = options.referenceYear ?? new Date().getUTCFullYear();
    const date = new Date(Date.UTC(year, month, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])));
    return { timestamp: date.toISOString(), level: inferLevel(m[8]), source: m[7], message: m[8] };
  },
};

export const FORMAT_STRATEGIES = [jsonStrategy, standardStrategy, bracketedStrategy, syslogStrategy];

/** Syslog lines carry no level, so infer one from keywords in the message. */
export function inferLevel(message) {
  const text = message.toLowerCase();
  if (/\b(fatal|panic|critical)\b/.test(text)) return 'FATAL';
  if (/\b(error|failed|failure|exception|refused|timed out|timeout)\b/.test(text)) return 'ERROR';
  if (/\b(warn|warning|deprecated|retry|retrying|slow)\b/.test(text)) return 'WARN';
  if (/\bdebug\b/.test(text)) return 'DEBUG';
  return 'INFO';
}

/**
 * Parses raw log text into structured entries.
 *
 * Lines that match no format (for example stack-trace lines) are appended to
 * the previous entry's `details`, so a multi-line exception stays one entry.
 *
 * @param {string} text raw log file contents
 * @param {{ referenceYear?: number, maxEntries?: number }} [options]
 * @returns {{ entries: object[], formats: Record<string, number>, truncated: boolean }}
 */
export function parseLog(text, options = {}) {
  const maxEntries = options.maxEntries ?? Infinity;
  const entries = [];
  const formats = {};
  let truncated = false;
  const lines = String(text ?? '').split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;

    let parsed = null;
    let format = null;
    for (const strategy of FORMAT_STRATEGIES) {
      parsed = strategy.parse(line.trim(), options);
      if (parsed) {
        format = strategy.name;
        break;
      }
    }

    if (!parsed) {
      const previous = entries[entries.length - 1];
      if (previous) {
        previous.details = previous.details ? `${previous.details}\n${line}` : line;
        continue;
      }
      parsed = { timestamp: null, level: 'UNKNOWN', source: null, message: line.trim() };
      format = 'unrecognized';
    }

    if (entries.length >= maxEntries) {
      truncated = true;
      break;
    }

    formats[format] = (formats[format] ?? 0) + 1;
    entries.push({ id: entries.length + 1, lineNumber: i + 1, ...parsed, format });
  }

  return { entries, formats, truncated };
}
