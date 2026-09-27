import { useId } from 'react';
import { formatTime } from '../utils/filters.js';

const FILTER_LEVELS = ['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG'];

export default function FilterBar({ filters, onChange, counts, sources, resultCount, onClear }) {
  const searchId = useId();
  const sourceId = useId();
  const hasFilters = filters.levels.length > 0 || filters.query || filters.source || filters.from;

  const toggleLevel = (level) => {
    const levels = filters.levels.includes(level)
      ? filters.levels.filter((l) => l !== level)
      : [...filters.levels, level];
    onChange({ levels });
  };

  return (
    <div className="filters" role="search" aria-label="Filter log entries">
      <fieldset className="filters__levels">
        <legend className="visually-hidden">Levels</legend>
        {FILTER_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            className={`chip chip--${level.toLowerCase()}`}
            aria-pressed={filters.levels.includes(level)}
            onClick={() => toggleLevel(level)}
          >
            {level} <span className="chip__count">{counts[level] ?? 0}</span>
          </button>
        ))}
      </fieldset>

      <div className="filters__row">
        <div className="field">
          <label htmlFor={searchId}>Search</label>
          <input
            id={searchId}
            type="search"
            placeholder="Message, source or stack trace"
            value={filters.query}
            onChange={(e) => onChange({ query: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor={sourceId}>Source</label>
          <select id={sourceId} value={filters.source} onChange={(e) => onChange({ source: e.target.value })}>
            <option value="">All sources</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="filters__status">
        <span aria-live="polite">{resultCount.toLocaleString()} matching entries</span>
        {filters.from && (
          <span className="chip chip--static">
            {formatTime(filters.from)}–{formatTime(filters.to)} UTC
            <button type="button" aria-label="Clear time range" onClick={() => onChange({ from: null, to: null })}>×</button>
          </span>
        )}
        {hasFilters && (
          <button type="button" className="link" onClick={onClear}>Clear all filters</button>
        )}
      </div>
    </div>
  );
}
