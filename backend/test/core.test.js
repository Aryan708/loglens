import { expect } from 'chai';
import { parseLog, normalizeLevel, toIsoTimestamp, inferLevel } from '../src/core/parser.js';
import {
  summarize, bucketize, detectAnomalies, toTemplate, topErrorPatterns, chooseBucketSize, analyzeLog,
} from '../src/core/analyzer.js';

describe('parser', () => {
  describe('normalizeLevel', () => {
    it('maps aliases onto canonical levels', () => {
      expect(normalizeLevel('warning')).to.equal('WARN');
      expect(normalizeLevel('CRITICAL')).to.equal('FATAL');
      expect(normalizeLevel('err')).to.equal('ERROR');
      expect(normalizeLevel('info')).to.equal('INFO');
    });

    it('returns UNKNOWN for missing or unrecognised levels', () => {
      expect(normalizeLevel(undefined)).to.equal('UNKNOWN');
      expect(normalizeLevel('banana')).to.equal('UNKNOWN');
    });
  });

  describe('toIsoTimestamp', () => {
    it('handles comma milliseconds and a space separator', () => {
      expect(toIsoTimestamp('2026-03-14 10:22:01,123Z')).to.equal('2026-03-14T10:22:01.123Z');
    });

    it('handles epoch seconds and epoch millis', () => {
      expect(toIsoTimestamp(1773483721)).to.equal('2026-03-14T10:22:01.000Z');
      expect(toIsoTimestamp(1773483721000)).to.equal('2026-03-14T10:22:01.000Z');
    });

    it('treats timestamps without a zone as UTC', () => {
      expect(toIsoTimestamp('2026-03-14 10:22:01,500')).to.equal('2026-03-14T10:22:01.500Z');
      expect(toIsoTimestamp('2026-03-14T10:22:01+05:30')).to.equal('2026-03-14T04:52:01.000Z');
    });

    it('returns null for invalid input', () => {
      expect(toIsoTimestamp('not a date')).to.equal(null);
      expect(toIsoTimestamp('')).to.equal(null);
    });
  });

  describe('parseLog', () => {
    it('parses the standard "timestamp LEVEL [source] message" format', () => {
      const { entries } = parseLog('2026-03-14T10:22:01Z ERROR [payment-service] Card declined for order 42');
      expect(entries).to.have.lengthOf(1);
      expect(entries[0]).to.include({
        timestamp: '2026-03-14T10:22:01.000Z',
        level: 'ERROR',
        source: 'payment-service',
        message: 'Card declined for order 42',
        format: 'standard',
        lineNumber: 1,
      });
    });

    it('parses bracketed, JSON and syslog formats', () => {
      const text = [
        '[2026-03-14T10:22:01Z] [WARN] cart-api: Slow response 1200ms',
        '{"timestamp":"2026-03-14T10:22:02Z","level":"error","service":"auth","msg":"Token expired"}',
        'Mar 14 10:22:03 web-01 nginx[812]: upstream timed out while reading response',
      ].join('\n');
      const { entries, formats } = parseLog(text, { referenceYear: 2026 });

      expect(entries.map((e) => e.format)).to.deep.equal(['bracketed', 'json', 'syslog']);
      expect(entries.map((e) => e.level)).to.deep.equal(['WARN', 'ERROR', 'ERROR']);
      expect(entries[1].source).to.equal('auth');
      expect(entries[2]).to.include({ source: 'nginx', timestamp: '2026-03-14T10:22:03.000Z' });
      expect(formats).to.deep.equal({ bracketed: 1, json: 1, syslog: 1 });
    });

    it('attaches stack-trace lines to the previous entry', () => {
      const text = [
        '2026-03-14T10:22:01Z ERROR [orders] NullPointerException',
        '    at com.nike.orders.Service.place(Service.java:88)',
        '    at com.nike.orders.Api.post(Api.java:21)',
        '2026-03-14T10:22:02Z INFO [orders] Recovered',
      ].join('\n');
      const { entries } = parseLog(text);
      expect(entries).to.have.lengthOf(2);
      expect(entries[0].details).to.contain('Service.java:88').and.contain('Api.java:21');
      expect(entries[1].lineNumber).to.equal(4);
    });

    it('keeps an unrecognised first line as an UNKNOWN entry and skips blank lines', () => {
      const { entries } = parseLog('\n\nhello world\n');
      expect(entries).to.have.lengthOf(1);
      expect(entries[0]).to.include({ level: 'UNKNOWN', message: 'hello world', format: 'unrecognized' });
    });

    it('stops at maxEntries and reports truncation', () => {
      const text = Array.from({ length: 10 }, (_, i) => `2026-03-14T10:00:0${i}Z INFO [a] line ${i}`).join('\n');
      const result = parseLog(text, { maxEntries: 5 });
      expect(result.entries).to.have.lengthOf(5);
      expect(result.truncated).to.equal(true);
    });

    it('infers syslog levels from message keywords', () => {
      expect(inferLevel('kernel panic')).to.equal('FATAL');
      expect(inferLevel('connection refused')).to.equal('ERROR');
      expect(inferLevel('retrying request')).to.equal('WARN');
      expect(inferLevel('started ok')).to.equal('INFO');
    });
  });
});

describe('analyzer', () => {
  const entry = (timestamp, level, message = 'msg', source = 'svc') => ({ timestamp, level, message, source });

  it('summarize counts levels, sources and the time range', () => {
    const summary = summarize([
      entry('2026-03-14T10:00:00.000Z', 'INFO'),
      entry('2026-03-14T10:05:00.000Z', 'ERROR', 'x', 'db'),
      entry('2026-03-14T10:01:00.000Z', 'FATAL', 'y', 'db'),
      entry(null, 'WARN'),
    ]);
    expect(summary.total).to.equal(4);
    expect(summary.errorCount).to.equal(2);
    expect(summary.warnCount).to.equal(1);
    expect(summary.errorRate).to.equal(0.5);
    expect(summary.firstTimestamp).to.equal('2026-03-14T10:00:00.000Z');
    expect(summary.lastTimestamp).to.equal('2026-03-14T10:05:00.000Z');
    expect(summary.topSources[0]).to.deep.equal({ source: 'svc', count: 2 });
  });

  it('chooseBucketSize picks a nice interval', () => {
    expect(chooseBucketSize(60 * 60 * 1000)).to.equal(5 * 60 * 1000); // 1h span -> 5 min buckets
    expect(chooseBucketSize(10 * 1000)).to.equal(1000);
  });

  it('bucketize groups entries into fixed-width buckets', () => {
    const { buckets, bucketMs } = bucketize([
      entry('2026-03-14T10:00:10.000Z', 'INFO'),
      entry('2026-03-14T10:00:50.000Z', 'ERROR'),
      entry('2026-03-14T10:02:05.000Z', 'ERROR'),
    ], 60 * 1000);
    expect(bucketMs).to.equal(60000);
    expect(buckets.map((b) => b.total)).to.deep.equal([2, 0, 1]);
    expect(buckets[0].counts.ERROR).to.equal(1);
    expect(buckets[1].start).to.equal('2026-03-14T10:01:00.000Z');
  });

  it('bucketize returns no buckets when nothing has a timestamp', () => {
    expect(bucketize([entry(null, 'INFO')]).buckets).to.deep.equal([]);
  });

  it('detectAnomalies flags an error spike and ignores flat series', () => {
    const make = (errors) => errors.map((n, i) => ({
      start: `t${i}`, total: n, counts: { ERROR: n, FATAL: 0 },
    }));
    const spike = detectAnomalies(make([1, 0, 1, 1, 0, 1, 12, 1, 0, 1]));
    expect(spike).to.have.lengthOf(1);
    expect(spike[0]).to.include({ start: 't6', errorCount: 12 });
    expect(spike[0].zScore).to.be.greaterThan(2);

    expect(detectAnomalies(make([2, 2, 2, 2]))).to.deep.equal([]);
    expect(detectAnomalies(make([0, 5]))).to.deep.equal([]);
  });

  it('toTemplate masks ids, numbers, IPs and strings', () => {
    expect(toTemplate('Timeout after 3000ms for order 8812 from 10.0.0.12:443'))
      .to.equal('Timeout after <NUM>ms for order <NUM> from <IP>');
    expect(toTemplate('User "alice" 3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f failed'))
      .to.equal('User <STR> <UUID> failed');
  });

  it('topErrorPatterns groups similar errors together', () => {
    const patterns = topErrorPatterns([
      entry('t', 'ERROR', 'Timeout after 3000ms', 'a'),
      entry('t', 'ERROR', 'Timeout after 5000ms', 'b'),
      entry('t', 'FATAL', 'Disk full'),
      entry('t', 'INFO', 'Timeout after 1ms'),
    ]);
    expect(patterns[0]).to.deep.include({ template: 'Timeout after <NUM>ms', count: 2 });
    expect(patterns[0].sources).to.have.members(['a', 'b']);
    expect(patterns).to.have.lengthOf(2);
  });

  it('analyzeLog runs the whole pipeline', () => {
    const result = analyzeLog('2026-03-14T10:00:00Z ERROR [a] boom\n2026-03-14T10:00:30Z INFO [a] ok');
    expect(result.summary.total).to.equal(2);
    expect(result.buckets.length).to.be.greaterThan(0);
    expect(result.patterns[0].template).to.equal('boom');
  });
});
