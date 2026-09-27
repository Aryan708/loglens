/**
 * Client for the LogLens REST API (API Gateway + Lambda).
 * Only used in cloud mode, when VITE_API_URL is set at build time.
 */
import { API_URL } from '../config.js';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message ?? `Request failed (${response.status})`, response.status);
  return body;
}

export function createUpload(file) {
  return request('/uploads', {
    method: 'POST',
    body: JSON.stringify({ fileName: file.name, size: file.size, contentType: file.type || 'text/plain' }),
  });
}

/** PUTs the file straight to S3 using the presigned URL. */
export async function uploadToS3(uploadUrl, file, contentType) {
  const response = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } });
  if (!response.ok) throw new ApiError(`Upload to S3 failed (${response.status})`, response.status);
}

export function getJob(jobId) {
  return request(`/jobs/${jobId}`);
}

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Polls until the Step Functions pipeline finishes. */
export async function waitForJob(jobId, { intervalMs = 1500, timeoutMs = 90_000, onStatus = () => {} } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await getJob(jobId);
    onStatus(job.status);
    if (job.status === 'COMPLETE') return job;
    if (job.status === 'FAILED') throw new ApiError(job.errorMessage ?? 'Processing failed', 500);
    await wait(intervalMs);
  }
  throw new ApiError('Timed out waiting for the analysis to finish', 504);
}

export async function fetchResults(resultUrl) {
  const response = await fetch(resultUrl);
  if (!response.ok) throw new ApiError(`Could not download results (${response.status})`, response.status);
  return response.json();
}

/** Full cloud flow: request upload URL -> upload -> wait for the pipeline -> download results. */
export async function analyzeInCloud(file, onStatus = () => {}) {
  onStatus('Requesting upload URL…');
  const { jobId, uploadUrl, contentType } = await createUpload(file);
  onStatus('Uploading to S3…');
  await uploadToS3(uploadUrl, file, contentType);
  onStatus('Processing in AWS Step Functions…');
  const job = await waitForJob(jobId, { onStatus: (s) => onStatus(`Pipeline status: ${s}`) });
  const results = await fetchResults(job.resultUrl);
  return { ...results, anomalies: job.summary?.anomalies ?? [], jobId };
}
