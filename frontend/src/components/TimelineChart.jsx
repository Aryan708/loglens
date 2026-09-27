import { useMemo, useState } from 'react';
import { formatDuration, formatTime } from '../utils/filters.js';

const WIDTH = 800;
const HEIGHT = 220;
const PAD = { top: 18, right: 8, bottom: 26, left: 36 };

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function niceMax(value) {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

/**
 * Stacked bar chart of log volume over time, drawn with plain SVG.
 * Each bar is keyboard-focusable; Enter or click filters the table to that time window.
 */
export default function TimelineChart({ buckets, bucketMs, anomalies, selectedStart, onSelect }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const anomalyStarts = useMemo(() => new Set(anomalies.map((a) => a.start)), [anomalies]);

  if (buckets.length === 0) {
    return (
      <section className="panel" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading">Timeline</h2>
        <p className="muted">No timestamps were found, so there is no timeline to show.</p>
      </section>
    );
  }

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const yMax = niceMax(Math.max(...buckets.map((b) => b.total)));
  const slot = plotW / buckets.length;
  const barW = Math.max(2, slot * 0.72);
  const y = (v) => (v / yMax) * plotH;
  const labelEvery = Math.ceil(buckets.length / 8);

  const describe = (b) => {
    const errors = b.counts.ERROR + b.counts.FATAL;
    const spike = anomalyStarts.has(b.start) ? ' Error spike.' : '';
    return `${formatTime(b.start)} UTC: ${plural(b.total, 'entry', 'entries')}, ${plural(errors, 'error')}, ${plural(b.counts.WARN, 'warning')}.${spike}`;
  };

  const active = activeIndex !== null ? buckets[activeIndex] : null;
  const select = (b) => onSelect(selectedStart === b.start ? null : b);

  return (
    <section className="panel" aria-labelledby="timeline-heading">
      <div className="panel__header">
        <h2 id="timeline-heading">Timeline</h2>
        <p className="muted small">
          {formatDuration(bucketMs)} buckets · click a bar to filter
        </p>
      </div>
      <div className="legend" aria-hidden="true">
        <span><i className="swatch swatch--error" />Errors</span>
        <span><i className="swatch swatch--warn" />Warnings</span>
        <span><i className="swatch swatch--other" />Other</span>
        <span><i className="swatch swatch--spike" />Spike</span>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="chart" role="group" aria-label="Log entries over time">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              className="chart__grid"
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={PAD.top + plotH - t * plotH}
              y2={PAD.top + plotH - t * plotH}
            />
            <text className="chart__axis" x={PAD.left - 6} y={PAD.top + plotH - t * plotH + 4} textAnchor="end">
              {Math.round(yMax * t)}
            </text>
          </g>
        ))}

        {buckets.map((b, i) => {
          const errors = b.counts.ERROR + b.counts.FATAL;
          const warns = b.counts.WARN;
          const other = b.total - errors - warns;
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const base = PAD.top + plotH;
          const isSpike = anomalyStarts.has(b.start);
          const isSelected = selectedStart === b.start;
          return (
            <g
              key={b.start}
              className={`chart__bar${isSelected ? ' chart__bar--selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={describe(b)}
              onClick={() => select(b)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  select(b);
                }
              }}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(i)}
              onBlur={() => setActiveIndex(null)}
            >
              <rect className="chart__hit" x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} />
              <rect className="fill-error" x={x} width={barW} y={base - y(errors)} height={y(errors)} />
              <rect className="fill-warn" x={x} width={barW} y={base - y(errors + warns)} height={y(warns)} />
              <rect className="fill-other" x={x} width={barW} y={base - y(b.total)} height={y(other)} />
              {isSpike && (
                <path
                  className="chart__spike"
                  d={`M${x + barW / 2 - 5},${base - y(b.total) - 12} h10 l-5,8 z`}
                />
              )}
              {i % labelEvery === 0 && (
                <text className="chart__axis" x={x + barW / 2} y={HEIGHT - 8} textAnchor="middle">
                  {formatTime(b.start).slice(0, 5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <p className="chart__readout small" aria-live="polite">
        {active ? describe(active) : 'Hover over or focus a bar to see its counts.'}
      </p>
    </section>
  );
}
