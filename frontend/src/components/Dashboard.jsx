import { useDeferredValue, useMemo, useState } from 'react';
import SummaryCards from './SummaryCards.jsx';
import TimelineChart from './TimelineChart.jsx';
import ErrorPatterns from './ErrorPatterns.jsx';
import FilterBar from './FilterBar.jsx';
import LogTable from './LogTable.jsx';
import { filterEntries, paginate, sortEntries, uniqueSources } from '../utils/filters.js';

const EMPTY_FILTERS = { levels: [], query: '', source: '', from: null, to: null };

export default function Dashboard({ result }) {
  const { entries, summary, buckets, bucketMs, anomalies = [], patterns = [] } = result;
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState({ key: 'lineNumber', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Keeps typing responsive on large logs: React filters with the previous
  // query while the new one is still being typed.
  const deferredQuery = useDeferredValue(filters.query);
  const sources = useMemo(() => uniqueSources(entries), [entries]);
  const filtered = useMemo(
    () => filterEntries(entries, { ...filters, query: deferredQuery }),
    [entries, filters, deferredQuery],
  );
  const sorted = useMemo(() => sortEntries(filtered, sort.key, sort.direction), [filtered, sort]);
  const view = paginate(sorted, page, pageSize);

  const updateFilters = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const selectBucket = (bucket) => {
    if (!bucket) {
      updateFilters({ from: null, to: null });
      return;
    }
    const to = new Date(Date.parse(bucket.start) + bucketMs).toISOString();
    updateFilters({ from: bucket.start, to });
  };

  const handleSort = (key) => {
    setSort((s) => ({ key, direction: s.key === key && s.direction === 'asc' ? 'desc' : 'asc' }));
    setPage(1);
  };

  return (
    <div className="dashboard">
      <SummaryCards summary={summary} anomalies={anomalies} />
      <div className="grid-2">
        <TimelineChart
          buckets={buckets}
          bucketMs={bucketMs}
          anomalies={anomalies}
          selectedStart={filters.from}
          onSelect={selectBucket}
        />
        <ErrorPatterns patterns={patterns} onShow={(query) => updateFilters({ query, levels: ['ERROR', 'FATAL'] })} />
      </div>
      <section className="panel" aria-labelledby="entries-heading">
        <h2 id="entries-heading">Log entries</h2>
        <FilterBar
          filters={filters}
          onChange={updateFilters}
          counts={summary.byLevel}
          sources={sources}
          resultCount={filtered.length}
          onClear={() => updateFilters(EMPTY_FILTERS)}
        />
        <LogTable
          rows={view.items}
          sort={sort}
          onSort={handleSort}
          query={deferredQuery}
          page={view.page}
          pageCount={view.pageCount}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(n) => { setPageSize(n); setPage(1); }}
        />
      </section>
    </div>
  );
}
