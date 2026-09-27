/**
 * Repository pattern: every DynamoDB read and write for analysis jobs lives
 * here, so handlers talk about "jobs" and never build DynamoDB keys
 * themselves. Swapping the database later only touches this file.
 *
 * Table design (single table):
 *   pk = JOB#<jobId>, sk = META
 *   GSI "ByEntity": entity = "JOB", createdAt (sort) -> list the newest jobs
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const tableName = () => process.env.TABLE_NAME;
const keyFor = (jobId) => ({ pk: `JOB#${jobId}`, sk: 'META' });
const RETENTION_DAYS = 7;

function toJob(item) {
  if (!item) return null;
  const { pk, sk, entity, expiresAt, summary, ...job } = item;
  // Step Functions stores the summary as a JSON string; turn it back into an object.
  return { ...job, summary: typeof summary === 'string' ? JSON.parse(summary) : summary ?? null };
}

export async function createJob({ jobId, fileName, size, key }) {
  const now = new Date();
  const item = {
    ...keyFor(jobId),
    entity: 'JOB',
    jobId,
    fileName,
    size,
    uploadKey: key,
    status: 'PENDING_UPLOAD',
    createdAt: now.toISOString(),
    // DynamoDB TTL deletes old jobs automatically; this keeps storage costs near zero.
    expiresAt: Math.floor(now.getTime() / 1000) + RETENTION_DAYS * 24 * 3600,
  };
  await docClient.send(new PutCommand({
    TableName: tableName(),
    Item: item,
    ConditionExpression: 'attribute_not_exists(pk)',
  }));
  return toJob(item);
}

export async function getJob(jobId) {
  const { Item } = await docClient.send(new GetCommand({ TableName: tableName(), Key: keyFor(jobId) }));
  return toJob(Item);
}

export async function listJobs(limit = 20) {
  const { Items = [] } = await docClient.send(new QueryCommand({
    TableName: tableName(),
    IndexName: 'ByEntity',
    KeyConditionExpression: 'entity = :job',
    ExpressionAttributeValues: { ':job': 'JOB' },
    ScanIndexForward: false, // newest first
    Limit: limit,
  }));
  return Items.map(toJob);
}

export async function markProcessing(jobId) {
  await docClient.send(new UpdateCommand({
    TableName: tableName(),
    Key: keyFor(jobId),
    UpdateExpression: 'SET #status = :status, startedAt = :now',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': 'PROCESSING', ':now': new Date().toISOString() },
  }));
}
