/** GET /jobs?limit=20 lists the most recent analysis jobs, newest first. */
import { badRequest, ok, serverError } from '../lib/http.js';
import { listJobs } from '../lib/jobsRepository.js';

export async function handler(event) {
  try {
    const raw = event.queryStringParameters?.limit ?? '20';
    const limit = Number(raw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return badRequest('limit must be an integer between 1 and 100');
    }
    const jobs = await listJobs(limit);
    return ok({ jobs });
  } catch (error) {
    return serverError(error);
  }
}
