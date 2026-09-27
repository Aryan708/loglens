/**
 * POST /uploads
 * Body: { "fileName": "app.log", "size": 12345, "contentType": "text/plain" }
 *
 * Creates a job record and returns a short-lived presigned S3 URL. The browser
 * PUTs the file to that URL; the S3 "Object Created" event then starts the
 * Step Functions pipeline.
 */
import { randomUUID } from 'node:crypto';
import { badRequest, created, parseJsonBody, serverError } from '../lib/http.js';
import { createJob } from '../lib/jobsRepository.js';
import { presignUpload, uploadKeyFor } from '../lib/storage.js';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.log', '.txt', '.json', '.jsonl', '.out'];

/** Keeps only safe characters, so the S3 key never needs URL-encoding. */
export function sanitizeFileName(name) {
  const base = String(name).split(/[\\/]/).pop();
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export function validateUploadRequest(body) {
  if (!body || typeof body !== 'object') return 'Request body must be valid JSON';
  if (!body.fileName || typeof body.fileName !== 'string') return 'fileName is required';
  const lower = body.fileName.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return `File type not supported. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`;
  }
  if (!Number.isInteger(body.size) || body.size <= 0) return 'size must be a positive integer (bytes)';
  if (body.size > MAX_UPLOAD_BYTES) return `File is too large. Maximum is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`;
  return null;
}

export async function handler(event) {
  try {
    const body = parseJsonBody(event);
    const problem = validateUploadRequest(body);
    if (problem) return badRequest(problem);

    const jobId = randomUUID();
    const fileName = sanitizeFileName(body.fileName);
    const key = uploadKeyFor(jobId, fileName);
    const contentType = body.contentType || 'text/plain';

    await createJob({ jobId, fileName, size: body.size, key });
    const uploadUrl = await presignUpload(key, contentType);

    return created({ jobId, uploadUrl, key, contentType, expiresInSeconds: 300 });
  } catch (error) {
    return serverError(error);
  }
}
