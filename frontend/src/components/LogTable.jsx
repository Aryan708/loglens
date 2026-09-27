import { Fragment, useState } from 'react';
import { formatTime } from '../utils/filters.js';

const COLUMNS = [
  { key: 'lineNumber', label: 'Line' },
  { key: 'timestamp', label: 'Time (UTC)' },
  { key: 'level', label: 'Level' },
  { key: 'source', label: 'Source' },
  { key: null, label: 'Message' },
];

/** Wraps matches of `query` in <mark> so users can see why a row matched. */
export function Highlight({ text, query }) {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const parts = [];
  let from = 0;
  let index = lower.indexOf(q.toLowerCase());
  while (index !== -1) {
    parts.push(text.slice(from, index), <mark key={index}>{text.slice(index, index + q.length)}</mark>);
    from = index + q.length;
    index = lower.indexOf(q.toLowerCase(), from);
  }
  parts.push(text.slice(from));
  return parts;
}

export default function LogTable({ rows, sort, onSort, query, page, pageCount, pageSize, onPage, onPageSize }) {
  const [expanded, setExpanded] = useState(() => new Set());

  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <div className="table-wrap">
      <table className="log-table">
        <caption className="visually-hidden">Log entries, page {page} of {pageCount}</caption>
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const isSorted = sort.key === col.key;
              const ariaSort = isSorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
              return (
                <th key={col.label} scope="col" aria-sort={col.key ? ariaSort : undefined}>
                  {col.key ? (
                    <button type="button" className="th-button" onClick={() => onSort(col.key)}>
                      {col.label}
                      <span aria-hidden="true" className="sort-icon">
                        {isSorted ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : col.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="empty">No entries match these filters.</td>
            </tr>
          )}
          {rows.map((row) => {
            const isOpen = expanded.has(row.id);
            return (
              <Fragment key={row.id}>
                <tr className={`row row--${row.level.toLowerCase()}`}>
                  <td className="mono muted">{row.lineNumber}</td>
                  <td className="mono nowrap">{formatTime(row.timestamp)}</td>
                  <td><span className={`badge badge--${row.level.toLowerCase()}`}>{row.level}</span></td>
                  <td className="nowrap">{row.source ?? '—'}</td>
                  <td className="message">
                    <Highlight text={row.message} query={query} />
                    {row.details && (
                      <button
                        type="button"
                        className="link small details-toggle"
                        aria-expanded={isOpen}
                        onClick={() => toggle(row.id)}
                      >
                        {isOpen ? 'Hide' : 'Show'} stack trace
                      </button>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="row-details">
                    <td colSpan={COLUMNS.length}><pre>{row.details}</pre></td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <nav className="pagination" aria-label="Table pagination">
        <button type="button" className="button" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          Previous
        </button>
        <span>Page {page} of {pageCount}</span>
        <button type="button" className="button" onClick={() => onPage(page + 1)} disabled={page >= pageCount}>
          Next
        </button>
        <label className="page-size">
          Rows
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
            {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </nav>
    </div>
  );
}
