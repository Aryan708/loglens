import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TimelineChart from './TimelineChart.jsx';
import ErrorPatterns, { searchTermFor } from './ErrorPatterns.jsx';
import LogTable, { Highlight } from './LogTable.jsx';
import SummaryCards from './SummaryCards.jsx';

const counts = (error, warn, info) => ({ FATAL: 0, ERROR: error, WARN: warn, INFO: info, DEBUG: 0, TRACE: 0, UNKNOWN: 0 });
const buckets = [
  { start: '2026-03-14T10:00:00.000Z', total: 10, counts: counts(1, 2, 7) },
  { start: '2026-03-14T10:05:00.000Z', total: 30, counts: counts(20, 2, 8) },
  { start: '2026-03-14T10:10:00.000Z', total: 12, counts: counts(0, 1, 11) },
];

describe('TimelineChart', () => {
  it('renders an accessible bar per bucket and marks spikes', () => {
    render(
      <TimelineChart
        buckets={buckets}
        bucketMs={300000}
        anomalies={[{ start: buckets[1].start, errorCount: 20, zScore: 3 }]}
        selectedStart={null}
        onSelect={() => {}}
      />,
    );
    const bars = screen.getAllByRole('button');
    expect(bars).toHaveLength(3);
    expect(bars[1]).toHaveAccessibleName(/10:05:00 UTC: 30 entries, 20 errors, 2 warnings\. Error spike\./);
    expect(screen.getByText('5 min buckets · click a bar to filter')).toBeInTheDocument();
  });

  it('selects a bucket with the mouse or keyboard and deselects it on a second click', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    const { rerender } = render(
      <TimelineChart buckets={buckets} bucketMs={300000} anomalies={[]} selectedStart={null} onSelect={onSelect} />,
    );
    const [first, second] = screen.getAllByRole('button');

    await user.click(first);
    expect(onSelect).toHaveBeenLastCalledWith(buckets[0]);

    await user.tab(); // keyboard focus moves from the first bar to the second
    expect(second).toHaveFocus();
    expect(screen.getByText(/10:05:00 UTC: 30 entries/, { selector: 'p' })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith(buckets[1]);

    rerender(
      <TimelineChart buckets={buckets} bucketMs={300000} anomalies={[]} selectedStart={buckets[1].start} onSelect={onSelect} />,
    );
    expect(screen.getAllByRole('button')[1]).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getAllByRole('button')[1]);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('explains when there are no timestamps', () => {
    render(<TimelineChart buckets={[]} bucketMs={1000} anomalies={[]} selectedStart={null} onSelect={() => {}} />);
    expect(screen.getByText(/No timestamps were found/)).toBeInTheDocument();
  });
});

describe('ErrorPatterns', () => {
  it('builds a useful search term from a template', () => {
    expect(searchTermFor('Timeout after <NUM>ms calling provider')).toBe('Timeout after');
    expect(searchTermFor('<IP> refused')).toBe('refused');
  });

  it('lists patterns and lets the user jump to matching entries', async () => {
    const onShow = jest.fn();
    render(
      <ErrorPatterns
        patterns={[{ template: 'Disk full on <STR>', count: 4, example: 'Disk full on "/var"', sources: ['node-1'] }]}
        onShow={onShow}
      />,
    );
    expect(screen.getByText('4×')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show matching entries' }));
    expect(onShow).toHaveBeenCalledWith('Disk full on');
  });

  it('shows an empty state', () => {
    render(<ErrorPatterns patterns={[]} onShow={() => {}} />);
    expect(screen.getByText(/No errors found/)).toBeInTheDocument();
  });
});

describe('LogTable', () => {
  const rows = [
    { id: 1, lineNumber: 1, timestamp: '2026-03-14T10:00:00.000Z', level: 'ERROR', source: 'db', message: 'Connection refused by db', details: 'at Pool.connect(pool.js:10)' },
    { id: 2, lineNumber: 2, timestamp: null, level: 'INFO', source: null, message: 'ok' },
  ];
  const baseProps = {
    rows, sort: { key: 'lineNumber', direction: 'asc' }, query: '', page: 1, pageCount: 2, pageSize: 25,
    onSort: jest.fn(), onPage: jest.fn(), onPageSize: jest.fn(),
  };

  it('renders rows with sortable headers exposing aria-sort', async () => {
    const onSort = jest.fn();
    render(<LogTable {...baseProps} onSort={onSort} />);
    expect(screen.getByRole('columnheader', { name: /Line/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: /Level/ })).toHaveAttribute('aria-sort', 'none');
    await userEvent.click(screen.getByRole('button', { name: /Level/ }));
    expect(onSort).toHaveBeenCalledWith('level');
  });

  it('expands and collapses a stack trace', async () => {
    render(<LogTable {...baseProps} />);
    const toggle = screen.getByRole('button', { name: 'Show stack trace' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(screen.getByText('at Pool.connect(pool.js:10)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hide stack trace' }));
    expect(screen.queryByText('at Pool.connect(pool.js:10)')).not.toBeInTheDocument();
  });

  it('paginates and changes page size', async () => {
    const onPage = jest.fn();
    const onPageSize = jest.fn();
    render(<LogTable {...baseProps} onPage={onPage} onPageSize={onPageSize} />);
    const nav = screen.getByRole('navigation', { name: 'Table pagination' });
    expect(within(nav).getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(within(nav).getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(2);
    await userEvent.selectOptions(within(nav).getByRole('combobox'), '100');
    expect(onPageSize).toHaveBeenCalledWith(100);
  });

  it('shows an empty message when nothing matches', () => {
    render(<LogTable {...baseProps} rows={[]} pageCount={1} />);
    expect(screen.getByText('No entries match these filters.')).toBeInTheDocument();
  });

  it('highlights every search match, case-insensitively', () => {
    const { container } = render(<p><Highlight text="Error: error again" query="ERROR" /></p>);
    expect(container.querySelectorAll('mark')).toHaveLength(2);
  });
});

describe('SummaryCards', () => {
  it('shows totals, error rate and spikes', () => {
    render(
      <SummaryCards
        summary={{
          total: 1284, errorCount: 96, warnCount: 99, errorRate: 0.0748, byLevel: {},
          firstTimestamp: '2026-03-14T09:00:00.000Z', lastTimestamp: '2026-03-14T11:00:00.000Z', topSources: [{}, {}],
        }}
        anomalies={[{ start: '2026-03-14T10:10:00.000Z' }]}
      />,
    );
    expect(screen.getByText('1,284')).toBeInTheDocument();
    expect(screen.getByText('7.5% of entries')).toBeInTheDocument();
    expect(screen.getByText('Worst at 10:10:00 UTC')).toBeInTheDocument();
    expect(screen.getByText('2 h')).toBeInTheDocument();
  });
});
