/** Twilio WhatsApp Content API adapter. Only approved ContentSid templates are sent. */
export type WhatsAppTopic = 'order.quote_ready' | 'payment.captured' | 'order.completed' | 'order.status_changed';

const templateKey: Record<WhatsAppTopic, string> = {
  'order.quote_ready': 'TWILIO_CONTENT_SID_QUOTE_READY',
  'payment.captured': 'TWILIO_CONTENT_SID_PAYMENT_CAPTURED',
  'order.completed': 'TWILIO_CONTENT_SID_ORDER_COMPLETED',
  'order.status_changed': 'TWILIO_CONTENT_SID_STATUS_UPDATE',
};

export function isWhatsAppTopic(value: string): value is WhatsAppTopic {
  return Object.prototype.hasOwnProperty.call(templateKey, value);
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Twilio WhatsApp is missing ${key}`);
  return value;
}

export function validateTwilioConfig(env: NodeJS.ProcessEnv = process.env): void {
  const account = required(env, 'TWILIO_ACCOUNT_SID');
  required(env, 'TWILIO_AUTH_TOKEN');
  const sender = required(env, 'TWILIO_WHATSAPP_FROM');
  if (!/^AC[a-f0-9]{32}$/i.test(account)) throw new Error('Invalid Twilio Account SID');
  if (!/^whatsapp:\+[1-9]\d{7,14}$/.test(sender)) throw new Error('TWILIO_WHATSAPP_FROM must be whatsapp:+E164');
  for (const key of Object.values(templateKey)) {
    if (!/^HX[a-f0-9]{32}$/i.test(required(env, key))) throw new Error(`Invalid ${key} Content SID`);
  }
}

/**
 * Variable 1 = StitchMate order number for all templates.
 * Variable 2 = human-readable order status for order.status_changed only.
 */
export function buildTwilioWhatsAppRequest(
  to: string,
  topic: WhatsAppTopic,
  orderNumber: string,
  status: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): { url: string; init: RequestInit } {
  const account = required(env, 'TWILIO_ACCOUNT_SID');
  const token = required(env, 'TWILIO_AUTH_TOKEN');
  const sender = required(env, 'TWILIO_WHATSAPP_FROM');
  const contentSid = required(env, templateKey[topic]);
  if (!/^AC[a-f0-9]{32}$/i.test(account) || !/^HX[a-f0-9]{32}$/i.test(contentSid)) throw new Error('Invalid Twilio account/template SID');
  if (!/^whatsapp:\+[1-9]\d{7,14}$/.test(sender) || !/^\+[1-9]\d{7,14}$/.test(to)) throw new Error('Invalid WhatsApp sender or recipient');
  if (!/^SM-[0-9A-Z-]{8,40}$/.test(orderNumber)) throw new Error('Invalid order reference');
  const variables: Record<string, string> = { '1': orderNumber };
  if (topic === 'order.status_changed') {
    if (!status || !/^[A-Z_]{2,60}$/.test(status)) throw new Error('A valid status is required for order updates');
    variables['2'] = status.replaceAll('_', ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
  }
  // Twilio's ContentSid replaces Body; business-initiated WhatsApp messages require approved templates.
  const body = new URLSearchParams({
    From: sender,
    To: `whatsapp:${to}`,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(variables),
  });
  return {
    url: `https://api.twilio.com/2010-04-01/Accounts/${account}/Messages.json`,
    init: {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${account}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(12000),
    },
  };
}

export async function sendTwilioWhatsApp(
  to: string,
  topic: WhatsAppTopic,
  orderNumber: string,
  status?: string,
  options: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch } = {},
): Promise<string> {
  const { url, init } = buildTwilioWhatsAppRequest(to, topic, orderNumber, status, options.env);
  const response = await (options.fetcher ?? fetch)(url, init);
  if (!response.ok) throw new Error(`Twilio WhatsApp request failed (${response.status})`);
  const receipt: unknown = await response.json().catch(() => null);
  if (!receipt || typeof receipt !== 'object' || !('sid' in receipt) || typeof receipt.sid !== 'string' || !/^SM[a-f0-9]{32}$/i.test(receipt.sid)) {
    throw new Error('Twilio did not acknowledge the WhatsApp message');
  }
  // Twilio accepting the message is not proof it was delivered to WhatsApp.
  return receipt.sid;
}
