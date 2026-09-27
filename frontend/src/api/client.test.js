jest.mock('../config.js', () => ({ API_URL: 'https://api.example.com', CLOUD_ENABLED: true, LOCAL_MAX_BYTES: 1000 }));

import { analyzeInCloud, createUpload, waitForJob, ApiError } from './client.js';

const jsonResponse = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => {
  global.fetch = jest.fn();
});

describe('api client', () => {
  it('createUpload posts file metadata to /uploads', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ jobId: 'j1', uploadUrl: 'https://s3/put' }, 201));
    const result = await createUpload({ name: 'app.log', size: 42, type: '' });

    expect(result.jobId).toBe('j1');
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/uploads');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ fileName: 'app.log', size: 42, contentType: 'text/plain' });
  });

  it('throws ApiError with the server message on failure', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ message: 'File type not supported' }, 400));
    await expect(createUpload({ name: 'a.exe', size: 1 })).rejects.toThrow(new ApiError('File type not supported', 400));
  });

  it('waitForJob polls until the job completes', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ status: 'PENDING_UPLOAD' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'PROCESSING' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'COMPLETE', resultUrl: 'https://s3/result' }));
    const statuses = [];
    const job = await waitForJob('j1', { intervalMs: 0, onStatus: (s) => statuses.push(s) });

    expect(job.resultUrl).toBe('https://s3/result');
    expect(statuses).toEqual(['PENDING_UPLOAD', 'PROCESSING', 'COMPLETE']);
  });

  it('waitForJob surfaces pipeline failures and timeouts', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ status: 'FAILED', errorMessage: 'Parse error' }));
    await expect(waitForJob('j1', { intervalMs: 0 })).rejects.toThrow('Parse error');

    fetch.mockResolvedValue(jsonResponse({ status: 'PROCESSING' }));
    await expect(waitForJob('j1', { intervalMs: 0, timeoutMs: 5 })).rejects.toThrow('Timed out');
  });

  it('analyzeInCloud runs upload -> S3 PUT -> poll -> download', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ jobId: 'j1', uploadUrl: 'https://s3/put', contentType: 'text/plain' }, 201))
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce(jsonResponse({ status: 'COMPLETE', resultUrl: 'https://s3/result', summary: { anomalies: [{ start: 't' }] } }))
      .mockResolvedValueOnce(jsonResponse({ entries: [], summary: { total: 0 } }));

    const steps = [];
    const result = await analyzeInCloud({ name: 'a.log', size: 5, type: 'text/plain' }, (s) => steps.push(s));

    expect(fetch.mock.calls[1][0]).toBe('https://s3/put');
    expect(fetch.mock.calls[1][1].method).toBe('PUT');
    expect(result).toMatchObject({ jobId: 'j1', anomalies: [{ start: 't' }], summary: { total: 0 } });
    expect(steps[0]).toMatch(/upload URL/);
  });

  it('reports a failed S3 upload', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ jobId: 'j1', uploadUrl: 'https://s3/put', contentType: 'text/plain' }, 201))
      .mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(analyzeInCloud({ name: 'a.log', size: 5 })).rejects.toThrow('Upload to S3 failed (403)');
  });
});
