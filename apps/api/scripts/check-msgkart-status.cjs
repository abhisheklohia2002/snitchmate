/*
 * Read-only MSGKART delivery checker.
 * Usage: node scripts/check-msgkart-status.cjs <transactionId>
 * Reads project-root .env and NEVER prints the API key or full recipient number.
 * Provider v2 status API documents the API key in the HTTPS query string;
 * do not use this script on a machine with URL-bearing request logging.
 */
const path = require('node:path');
const https = require('node:https');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const transactionId = process.argv[2] || '';
const businessId = process.env.MSGKART_BUSINESS_ID || '';
const apiKey = process.env.MSGKART_API_KEY || '';

if (!/^[a-zA-Z0-9_-]{8,128}$/.test(transactionId)) {
  console.error('Pass a valid transactionId from the MSGKART accepted log.');
  process.exitCode = 1;
} else if (!/^\d{5,30}$/.test(businessId) || !apiKey) {
  console.error('Missing MSGKART_BUSINESS_ID or MSGKART_API_KEY in project-root .env');
  process.exitCode = 1;
} else {
  const url = new URL(
    `/api/v2/message/${businessId}/status/${encodeURIComponent(transactionId)}/complete`,
    'https://alb-backend.msgkart.com',
  );
  url.searchParams.set('apikey', apiKey);

  const req = https.get(url, {
    family: 4,
    timeout: 12000,
    headers: { Accept: 'application/json' },
  }, (res) => {
    let response = '';
    res.on('data', (chunk) => {
      response += chunk;
      if (response.length > 65536) req.destroy(new Error('response too large'));
    });
    res.on('end', () => {
      console.log('Status endpoint HTTP:', res.statusCode);
      if (res.statusCode !== 200) {
        console.log('Status check failed; request permission or consult the MSGKART dashboard.');
        return;
      }
      try {
        const body = JSON.parse(response);
        if (!Array.isArray(body)) {
          console.log('Unexpected status response shape; use MSGKART dashboard.');
          return;
        }
        if (!body.length) {
          console.log('No delivery records yet; check again shortly.');
          return;
        }
        for (const entry of body) {
          console.log(JSON.stringify({
            status: entry.msg_status,
            errorCode: entry.error_code,
            failedReason: String(entry.failed_reason || '').replace(/\+?\d{8,15}/g, '[redacted]'),
            template: entry.template_name,
            recipientLast2: String(entry.subscriber_id || '').slice(-2),
            sentAt: entry.sent_at,
            deliveredAt: entry.delivered_at,
          }, null, 2));
        }
      } catch {
        console.log('Could not parse status response.');
      }
    });
  });
  req.on('timeout', () => req.destroy(new Error('status request timed out')));
  req.on('error', (err) => {
    console.error('Status query network error:', err.code || 'NETWORK_ERROR');
    process.exitCode = 1;
  });
}
