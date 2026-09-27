/** S3 access: presigned URLs for the browser, and reading/writing objects for the pipeline. */
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const s3 = new S3Client({});
const bucket = () => process.env.BUCKET_NAME;
const URL_TTL_SECONDS = 300;

export const uploadKeyFor = (jobId, fileName) => `uploads/${jobId}/${fileName}`;
export const resultKeyFor = (jobId) => `results/${jobId}.json`;

/** The browser uploads the file straight to S3, so large files never pass through Lambda. */
export function presignUpload(key, contentType) {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), {
    expiresIn: URL_TTL_SECONDS,
  });
}

export function presignDownload(key) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: URL_TTL_SECONDS });
}

export async function readText(bucketName, key) {
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
  return Body.transformToString('utf-8');
}

export async function writeJson(bucketName, key, data) {
  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: JSON.stringify(data),
    ContentType: 'application/json',
  }));
}
