import { postMsgkartHttps } from './msgkart-https';
/**
 * OTP delivery adapters. The API owns OTP generation, hashing and verification;
 * messaging providers only transport the code to the recipient.
 * Never log OTPs or provider keys outside explicit local mock mode.
 */
export type OtpPurpose = 'LOGIN_OTP' | 'HANDOFF_OTP';

type OtpDeliveryOptions = {
  env?: NodeJS.ProcessEnv;
  fetcher?: typeof fetch;
  logMock?: (message: string) => void;
};

type MsgkartComponent = {
  componentType: 'body' | 'button';
  parameters: { type: 'text'; text: string }[];
  sub_type?: 'url';
  index?: string;
};

type MsgkartPayload = {
  message: {
    messageType: 'template';
    name: string;
    language: string;
    components: MsgkartComponent[];
  };
  to: string;
  phoneNumberId: string;
};

function msgkartTimeoutMs(env: NodeJS.ProcessEnv): number {
  const value = env.MSGKART_TIMEOUT_MS?.trim();
  if (!value) return 20_000;
  const ms = Number(value);
  if (!Number.isInteger(ms) || ms < 3_000 || ms > 30_000) {
    throw new Error('MSGKART_TIMEOUT_MS must be an integer between 3000 and 30000');
  }
  return ms;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`OTP provider missing ${key}`);
  return value;
}

/**
 * MSGKART documents WhatsApp messages at /api/v3/message/{businessId}/template.
 * The old /api/v1 value is a base URL only, NOT the send-template endpoint.
 */
export function buildMsgkartOtpRequest(
  phone: string,
  otp: string,
  purpose: OtpPurpose,
  env: NodeJS.ProcessEnv = process.env,
): { url: string; init: RequestInit } {
  if (!/^\+[1-9]\d{7,14}$/.test(phone) || !/^\d{6}$/.test(otp)) {
    throw new Error('Invalid OTP destination or code');
  }
  const businessId = required(env, 'MSGKART_BUSINESS_ID');
  const apiKey = required(env, 'MSGKART_API_KEY');
  const phoneNumberId = required(env, 'MSGKART_PHONE_ID');
  const templateName = purpose === 'HANDOFF_OTP'
    ? env.MSGKART_HANDOFF_TEMPLATE_NAME?.trim() || required(env, 'MSGKART_OTP_TEMPLATE_NAME')
    : required(env, 'MSGKART_OTP_TEMPLATE_NAME');
  const language = env.MSGKART_OTP_TEMPLATE_LANGUAGE?.trim() || 'en_US';
  const buttonMode = env.MSGKART_OTP_BUTTON_MODE?.trim() || 'copy_code';
  if (!/^\d{5,30}$/.test(businessId) || !/^\d{5,30}$/.test(phoneNumberId)) {
    throw new Error('Invalid MSGKART business or phone number ID');
  }
  if (!/^[a-z0-9_]{1,60}$/.test(templateName) || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language)) {
    throw new Error('Invalid MSGKART template name or language');
  }
  if (buttonMode !== 'copy_code' && buttonMode !== 'none') {
    throw new Error('MSGKART_OTP_BUTTON_MODE must be copy_code or none');
  }
  const baseUrl = new URL(env.MSGKART_API_URL?.trim() || 'https://alb-backend.msgkart.com/api/v1');
  const isLocalDev = env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(baseUrl.hostname);
  if ((!isLocalDev && (baseUrl.protocol !== 'https:' || baseUrl.hostname !== 'alb-backend.msgkart.com')) ||
    (isLocalDev && !['http:', 'https:'].includes(baseUrl.protocol)) ||
    baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error('MSGKART_API_URL must use the official HTTPS endpoint');
  }
  const components: MsgkartComponent[] = [
    { componentType: 'body', parameters: [{ type: 'text', text: otp }] },
  ];
  // Meta authentication templates with a copy-code button require the OTP in
  // both body and button. Validate MSGKART's exact component mapping in sandbox.
  if (buttonMode === 'copy_code') {
    components.push({
      componentType: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: otp }],
    });
  }
  const payload: MsgkartPayload = {
    message: {
      messageType: 'template',
      name: templateName,
      language,
      components,
    },
    to: phone.slice(1),
    phoneNumberId,
  };
  const url = new URL(`/api/v3/message/${encodeURIComponent(businessId)}/template`, baseUrl);
  return {
    url: url.toString(),
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(msgkartTimeoutMs(env)),
    },
  };
}

export async function sendOtp(
  phone: string,
  otp: string,
  purpose: OtpPurpose,
  options: OtpDeliveryOptions = {},
): Promise<void> {
  const env = options.env ?? process.env;
  if (env.NODE_ENV !== 'production' && env.MOCK_OTP_ENABLED === 'true') {
    (options.logMock ?? console.info)(`[DEV ONLY] ${purpose} for ${phone.slice(0, 4)}***${phone.slice(-2)}: ${otp}`);
    return;
  }
  const fetcher = options.fetcher ?? fetch;
  if (env.SMS_PROVIDER === 'msgkart') {
    const { url, init } = buildMsgkartOtpRequest(phone, otp, purpose, env);
    let response: Response;
    try {
      response = await (options.fetcher ?? postMsgkartHttps)(url, init);
    } catch (error: unknown) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new Error(`MSGKART API timed out after ${msgkartTimeoutMs(env)}ms; check network and provider availability`);
      }
      throw error;
    }
    if (!response.ok) throw new Error(`MSGKART rejected OTP message (HTTP ${response.status})`);
    // A 2xx HTTP response alone does not prove that the provider queued a send.
    const receipt: unknown = await response.json().catch(() => null);
    if (!receipt || typeof receipt !== 'object' ||
      !(('messageId' in receipt && typeof receipt.messageId === 'string' && receipt.messageId.length > 0) ||
        ('transactionId' in receipt && typeof receipt.transactionId === 'string' && receipt.transactionId.length > 0))) {
      throw new Error('MSGKART did not acknowledge OTP message');
    }
    // Development-only delivery troubleshooting: never include phone, OTP or API key.
    // A provider receipt means accepted for processing, not delivered to WhatsApp.
    if (env.NODE_ENV !== 'production' && env.MSGKART_DEBUG_RECEIPT === 'true') {
      const transactionId = 'transactionId' in receipt && typeof receipt.transactionId === 'string'
        ? receipt.transactionId : undefined;
      const messageId = 'messageId' in receipt && typeof receipt.messageId === 'string'
        ? receipt.messageId : undefined;
      console.info('[MSGKART] accepted by provider:', JSON.stringify({ transactionId, messageId }));
    }
    return;
  }
  if (env.SMS_PROVIDER === 'webhook') {
    const url = required(env, 'SMS_WEBHOOK_URL');
    const key = required(env, 'SMS_WEBHOOK_KEY');
    if (env.NODE_ENV === 'production' && !url.startsWith('https://')) throw new Error('SMS webhook must use HTTPS');
    const response = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ phone, otp, template: purpose }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('SMS delivery failed');
    return;
  }
  throw new Error('OTP delivery provider not configured');
}
