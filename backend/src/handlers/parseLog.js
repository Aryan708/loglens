/**
 * Step Functions task 1: parse the uploaded log file.
 *
 * Input (from the ExtractJobId state): { jobId, bucket, key, size }
 * Output: { jobId, bucket, resultKey, summary, buckets, bucketMs }
 *
 * The full parsed entries go to S3 (results/<jobId>.json) because Step
 * Functions payloads are limited to 256 KB; only small aggregates flow on
 * to the next state.
 */
import { parseLog } from '../core/parser.js';
import { bucketize, summarize, topErrorPatterns } from '../core/analyzer.js';
import { markProcessing } from '../lib/jobsRepository.js';
import { readText, resultKeyFor, writeJson } from '../lib/storage.js';

export const MAX_ENTRIES = 200_000;

export async function handler(input) {
  const { jobId, bucket, key } = input;
  if (!jobId || !bucket || !key) throw new Error('parseLog input needs jobId, bucket and key');

  await markProcessing(jobId);
  const text = await readText(bucket, key);

  const { entries, formats, truncated } = parseLog(text, { maxEntries: MAX_ENTRIES });
  const summary = { ...summarize(entries), formats, truncated };
  const { bucketMs, buckets } = bucketize(entries);
  const patterns = topErrorPatterns(entries);

  const resultKey = resultKeyFor(jobId);
  await writeJson(bucket, resultKey, { jobId, summary, bucketMs, buckets, patterns, entries });

  console.log(JSON.stringify({ level: 'INFO', message: 'Parsed log', jobId, total: summary.total, truncated }));
  return { jobId, bucket, resultKey, summary: { ...summary, topPatterns: patterns }, bucketMs, buckets };
}
