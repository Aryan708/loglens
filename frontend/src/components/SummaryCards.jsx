import { formatDuration, formatPercent, formatTime } from '../utils/filters.js';

function Card({ label, value, detail, tone }) {
  return (
    <div className={`card${tone ? ` card--${tone}` : ''}`}>
      <dt>{label}</dt>
      <dd>
        <span className="card__value">{value}</span>
        {detail && <span className="card__detail">{detail}</span>}
      </dd>
    </div>
  );
}

export default function SummaryCards({ summary, anomalies }) {
  const span = summary.firstTimestamp && summary.lastTimestamp
    ? Date.parse(summary.lastTimestamp) - Date.parse(summary.firstTimestamp)
    : null;

  return (
    <dl className="cards" aria-label="Log summary">
      <Card label="Entries" value={summary.total.toLocaleString()} detail={`${summary.topSources.length} sources`} />
      <Card
        label="Errors"
        value={summary.errorCount.toLocaleString()}
        detail={`${formatPercent(summary.errorRate)} of entries`}
        tone={summary.errorCount > 0 ? 'danger' : undefined}
      />
      <Card label="Warnings" value={summary.warnCount.toLocaleString()} tone={summary.warnCount > 0 ? 'warn' : undefined} />
      <Card
        label="Error spikes"
        value={anomalies.length}
        detail={anomalies[0] ? `Worst at ${formatTime(anomalies[0].start)} UTC` : 'None detected'}
        tone={anomalies.length ? 'danger' : 'ok'}
      />
      <Card
        label="Time span"
        value={span === null ? '—' : formatDuration(span)}
        detail={summary.firstTimestamp ? `${formatTime(summary.firstTimestamp, { withDate: true })} UTC` : undefined}
      />
    </dl>
  );
}
