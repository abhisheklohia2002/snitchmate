/**
 * Native Node HTTPS transport for MSGKART only.
 * On some Linux/Node installations the built-in fetch (Undici) times out while
 * node:https reaches the same host. Preserve normal TLS certificate checks.
 */
import { request as httpsRequest } from 'node:https';

const MAX_RESPONSE_BYTES = 64 * 1024;

export function postMsgkartHttps(url: string, init: RequestInit): Promise<Response> {
  const target = new URL(url);
  // Do not send the API key to another host (including via HTTP redirects).
  if (target.protocol !== 'https:' || target.hostname !== 'alb-backend.msgkart.com' ||
      target.port || target.username || target.password) {
    throw new Error('MSGKART HTTPS transport requires the official HTTPS host');
  }
  if (init.method !== 'POST' || typeof init.body !== 'string') {
    throw new Error('MSGKART transport requires a JSON POST');
  }
  const headers = new Headers(init.headers);
  const apiKey = headers.get('x-api-key');
  if (!apiKey) throw new Error('Missing MSGKART API key header');

  return new Promise<Response>((resolve, reject) => {
    const req = httpsRequest(target, {
      method: 'POST',
      family: 4,
      // Node verifies the TLS certificate by default; never disable it.
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      signal: init.signal || undefined,
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          req.destroy(new Error('MSGKART response exceeded size limit'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        const status = res.statusCode ?? 502;
        if (status < 200 || status > 599) {
          reject(new Error('MSGKART returned an invalid HTTP status'));
          return;
        }
        resolve(new Response(Buffer.concat(chunks), {
          status,
          headers: { 'content-type': 'application/json' },
        }));
      });
    });

    req.on('error', (error: unknown) => {
      // Avoid including request headers, OTP, provider response, or credentials.
      const code = error && typeof error === 'object' && 'code' in error &&
        typeof error.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(error.code)
        ? error.code : 'NETWORK_ERROR';
      reject(new Error(`MSGKART HTTPS request failed (${code})`));
    });
    req.end(init.body);
  });
}
