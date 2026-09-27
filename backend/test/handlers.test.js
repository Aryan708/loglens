import { expect } from 'chai';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@smithy/util-stream';
import { Readable } from 'node:stream';

import { handler as createUpload, sanitizeFileName, validateUploadRequest } from '../src/handlers/createUpload.js';
import { handler as getJob } from '../src/handlers/getJob.js';
import { handler as listJobs } from '../src/handlers/listJobs.js';
import { handler as parseLogTask } from '../src/handlers/parseLog.js';
import { handler as detectAnomaliesTask } from '../src/handlers/detectAnomalies.js';

const ddb = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);
const JOB_ID = '3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f';
const bodyOf = (res) => JSON.parse(res.body);
const streamOf = (text) => sdkStreamMixin(Readable.from([Buffer.from(text)]));

beforeEach(() => {
  ddb.reset();
  s3.reset();
});

describe('POST /uploads (createUpload)', () => {
  it('creates a job and returns a presigned upload URL', async () => {
    ddb.on(PutCommand).resolves({});
    const res = await createUpload({ body: JSON.stringify({ fileName: 'my app.log', size: 2048 }) });

    expect(res.statusCode).to.equal(201);
    const body = bodyOf(res);
    expect(body.jobId).to.match(/^[0-9a-f-]{36}$/);
    expect(body.key).to.equal(`uploads/${body.jobId}/my_app.log`);
    expect(body.uploadUrl).to.contain('test-bucket').and.contain('X-Amz-Signature');

    const put = ddb.commandCalls(PutCommand)[0].args[0].input;
    expect(put.TableName).to.equal('test-table');
    expect(put.Item).to.include({ pk: `JOB#${body.jobId}`, status: 'PENDING_UPLOAD', entity: 'JOB' });
    expect(put.ConditionExpression).to.equal('attribute_not_exists(pk)');
  });

  it('rejects invalid requests with 400', async () => {
    const res = await createUpload({ body: JSON.stringify({ fileName: 'virus.exe', size: 10 }) });
    expect(res.statusCode).to.equal(400);
    expect(bodyOf(res).message).to.contain('not supported');
    expect(ddb.commandCalls(PutCommand)).to.have.lengthOf(0);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await createUpload({ body: '{nope' });
    expect(res.statusCode).to.equal(400);
  });

  it('returns 500 without leaking details when DynamoDB fails', async () => {
    ddb.on(PutCommand).rejects(new Error('ProvisionedThroughputExceeded'));
    const originalError = console.error;
    console.error = () => {};
    const res = await createUpload({ body: JSON.stringify({ fileName: 'a.log', size: 1 }) });
    console.error = originalError;
    expect(res.statusCode).to.equal(500);
    expect(res.body).to.not.contain('Provisioned');
  });

  it('validates size limits and sanitises file names', () => {
    expect(validateUploadRequest({ fileName: 'a.log', size: 0 })).to.contain('size');
    expect(validateUploadRequest({ fileName: 'a.log', size: 60 * 1024 * 1024 })).to.contain('too large');
    expect(validateUploadRequest({ fileName: 'a.log', size: 10 })).to.equal(null);
    expect(sanitizeFileName('../../etc/pass wd.log')).to.equal('pass_wd.log');
  });
});

describe('GET /jobs/{jobId} (getJob)', () => {
  it('returns a completed job with a result URL and parsed summary', async () => {
    ddb.on(GetCommand).resolves({
      Item: {
        pk: `JOB#${JOB_ID}`, sk: 'META', entity: 'JOB', jobId: JOB_ID, status: 'COMPLETE',
        resultKey: `results/${JOB_ID}.json`, summary: JSON.stringify({ total: 10 }),
      },
    });
    const res = await getJob({ pathParameters: { jobId: JOB_ID } });
    const body = bodyOf(res);

    expect(res.statusCode).to.equal(200);
    expect(body.summary).to.deep.equal({ total: 10 });
    expect(body.resultUrl).to.contain(`results/${JOB_ID}.json`);
    expect(body).to.not.have.property('pk');
  });

  it('returns 404 for an unknown job and 400 for a bad id', async () => {
    ddb.on(GetCommand).resolves({});
    expect((await getJob({ pathParameters: { jobId: JOB_ID } })).statusCode).to.equal(404);
    expect((await getJob({ pathParameters: { jobId: 'abc' } })).statusCode).to.equal(400);
  });
});

describe('GET /jobs (listJobs)', () => {
  it('queries the ByEntity index newest first', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ pk: 'JOB#1', sk: 'META', jobId: '1', status: 'COMPLETE' }] });
    const res = await listJobs({ queryStringParameters: { limit: '5' } });

    expect(res.statusCode).to.equal(200);
    expect(bodyOf(res).jobs).to.deep.equal([{ jobId: '1', status: 'COMPLETE', summary: null }]);
    const query = ddb.commandCalls(QueryCommand)[0].args[0].input;
    expect(query).to.include({ IndexName: 'ByEntity', ScanIndexForward: false, Limit: 5 });
  });

  it('rejects an out-of-range limit', async () => {
    const res = await listJobs({ queryStringParameters: { limit: '500' } });
    expect(res.statusCode).to.equal(400);
  });
});

describe('Step Functions tasks', () => {
  const log = [
    '2026-03-14T10:00:00Z INFO [api] started',
    '2026-03-14T10:00:10Z ERROR [db] Timeout after 3000ms',
    '2026-03-14T10:00:20Z ERROR [db] Timeout after 5000ms',
  ].join('\n');

  it('parseLog marks the job processing, stores results in S3 and returns aggregates', async () => {
    ddb.on(UpdateCommand).resolves({});
    s3.on(GetObjectCommand).resolves({ Body: streamOf(log) });
    s3.on(PutObjectCommand).resolves({});

    const out = await parseLogTask({ jobId: JOB_ID, bucket: 'test-bucket', key: `uploads/${JOB_ID}/app.log` });

    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input.ExpressionAttributeValues[':status']).to.equal('PROCESSING');
    const put = s3.commandCalls(PutObjectCommand)[0].args[0].input;
    expect(put.Key).to.equal(`results/${JOB_ID}.json`);
    expect(JSON.parse(put.Body).entries).to.have.lengthOf(3);

    expect(out).to.include({ jobId: JOB_ID, resultKey: `results/${JOB_ID}.json` });
    expect(out.summary).to.include({ total: 3, errorCount: 2 });
    expect(out.summary.topPatterns[0]).to.include({ template: 'Timeout after <NUM>ms', count: 2 });
    expect(out).to.not.have.property('entries');
  });

  it('parseLog fails fast on bad input so Step Functions can catch it', async () => {
    let caught;
    try {
      await parseLogTask({ jobId: JOB_ID });
    } catch (error) {
      caught = error;
    }
    expect(caught).to.be.instanceOf(Error);
  });

  it('detectAnomalies adds anomalies to the summary and drops raw buckets', async () => {
    const buckets = [1, 0, 1, 1, 0, 1, 12, 1, 0, 1].map((n, i) => ({
      start: `2026-03-14T10:0${i}:00.000Z`, total: n, counts: { ERROR: n, FATAL: 0 },
    }));
    const out = await detectAnomaliesTask({ jobId: JOB_ID, resultKey: 'r', summary: { total: 19 }, buckets, bucketMs: 60000 });

    expect(out.anomalyCount).to.equal(1);
    expect(out.summary.anomalies[0].start).to.equal('2026-03-14T10:06:00.000Z');
    expect(out).to.not.have.property('buckets');
  });
});
