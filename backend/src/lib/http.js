/** Small helpers for API Gateway (HTTP API, payload v2) responses. */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN ?? '*',
  'Content-Type': 'application/json',
};

export function json(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

export const ok = (body) => json(200, body);
export const created = (body) => json(201, body);
export const badRequest = (message) => json(400, { error: 'BadRequest', message });
export const notFound = (message) => json(404, { error: 'NotFound', message });

export function serverError(error) {
  // Log the real error for CloudWatch, but never leak internals to the client.
  console.error(JSON.stringify({ level: 'ERROR', message: error.message, stack: error.stack }));
  return json(500, { error: 'InternalServerError', message: 'Something went wrong' });
}

export function parseJsonBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
