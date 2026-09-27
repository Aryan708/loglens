/**
 * GET /jobs/{jobId}
 * Returns the job's status. Once the pipeline has finished it also returns a
 * presigned URL for the full results JSON (entries, buckets, patterns).
 */
import { badRequest, notFound, ok, serverError } from '../lib/http.js';
import { getJob } from '../lib/jobsRepository.js';
import { presignDownload } from '../lib/storage.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handler(event) {
  try {
    const jobId = event.pathParameters?.jobId;
    if (!jobId || !UUID.test(jobId)) return badRequest('jobId must be a UUID');

    const job = await getJob(jobId);
    if (!job) return notFound(`Job ${jobId} not found`);

    if (job.status === 'COMPLETE' && job.resultKey) {
      job.resultUrl = await presignDownload(job.resultKey);
    }
    return ok(job);
  } catch (error) {
    return serverError(error);
  }
}
