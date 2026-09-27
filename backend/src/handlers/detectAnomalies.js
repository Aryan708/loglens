/**
 * Step Functions task 2: find error spikes in the time-bucketed counts.
 *
 * Input: output of parseLog. Output: the same job fields plus anomalies and
 * anomalyCount, ready for the SaveResults state to write to DynamoDB.
 * Buckets are dropped here to keep the final state payload small.
 */
import { detectAnomalies } from '../core/analyzer.js';

export async function handler(input) {
  const { jobId, resultKey, summary, buckets = [], bucketMs } = input;
  const threshold = Number(process.env.ANOMALY_Z_THRESHOLD ?? 2);
  const anomalies = detectAnomalies(buckets, { threshold });

  return {
    jobId,
    resultKey,
    anomalyCount: anomalies.length,
    summary: { ...summary, bucketMs, anomalies: anomalies.slice(0, 10) },
  };
}
