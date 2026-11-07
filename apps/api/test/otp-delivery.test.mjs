import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildMsgkartOtpRequest, sendOtp } = require('../dist/core/otp-delivery.js');

const env = {
  NODE_ENV: 'development',
  SMS_PROVIDER: 'msgkart',
  MOCK_OTP_ENABLED: 'false',
  MSGKART_API_URL: 'https://alb-backend.msgkart.com/api/v1',
  MSGKART_BUSINESS_ID: '12345678901',
  MSGKART_API_KEY: 'local-test-value-not-a-real-key',
  MSGKART_PHONE_ID: '98765432100',
  MSGKART_OTP_TEMPLATE_NAME: 'stitchmate_login_code',
  MSGKART_HANDOFF_TEMPLATE_NAME: 'stitchmate_handoff_code',
  MSGKART_OTP_TEMPLATE_LANGUAGE: 'en_US',
  MSGKART_OTP_BUTTON_MODE: 'copy_code',
};

test('MsgKart uses v3 WhatsApp template endpoint, not the supplied v1 base URL', () => {
  const { url, init } = buildMsgkartOtpRequest('+919876543210', '123456', 'LOGIN_OTP', env);
  assert.equal(url, 'https://alb-backend.msgkart.com/api/v3/message/12345678901/template');
  assert.equal(init.headers['x-api-key'], env.MSGKART_API_KEY);
  assert.ok(!url.includes(env.MSGKART_API_KEY));
  const payload = JSON.parse(init.body);
  assert.equal(payload.to, '919876543210');
  assert.equal(payload.phoneNumberId, env.MSGKART_PHONE_ID);
  assert.equal(payload.message.name, env.MSGKART_OTP_TEMPLATE_NAME);
  assert.equal(payload.message.components[0].parameters[0].text, '123456');
  assert.equal(payload.message.components[1].parameters[0].text, '123456');
  assert.equal(payload.message.components[1].sub_type, 'url');
});

test('Handoff OTP uses its approved template and accepts a body-only template configuration', () => {
  const { init } = buildMsgkartOtpRequest('+919876543210', '654321', 'HANDOFF_OTP', {
    ...env,
    MSGKART_OTP_BUTTON_MODE: 'none',
  });
  const payload = JSON.parse(init.body);
  assert.equal(payload.message.name, 'stitchmate_handoff_code');
  assert.equal(payload.message.components.length, 1);
});

test('Missing WhatsApp template fails closed before any provider request', async () => {
  let requests = 0;
  await assert.rejects(
    sendOtp('+919876543210', '123456', 'LOGIN_OTP', {
      env: { ...env, MSGKART_OTP_TEMPLATE_NAME: '' },
      fetcher: async () => { requests++; return new Response('{}'); },
    }),
    /MSGKART_OTP_TEMPLATE_NAME/,
  );
  assert.equal(requests, 0);
});

test('Provider must acknowledge message and non-2xx/rejected results never count as sent', async () => {
  const fetcher = async (_url, _init) => new Response(JSON.stringify({ transactionId: 'test-transaction' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  await sendOtp('+919876543210', '123456', 'LOGIN_OTP', { env, fetcher });
  await assert.rejects(
    sendOtp('+919876543210', '123456', 'LOGIN_OTP', {
      env,
      fetcher: async () => new Response(JSON.stringify({ error: 'Invalid key' }), { status: 401 }),
    }),
    /rejected/,
  );
  await assert.rejects(
    sendOtp('+919876543210', '123456', 'LOGIN_OTP', {
      env,
      fetcher: async () => new Response('{}', { status: 200 }),
    }),
    /acknowledge/,
  );
});

test('Official HTTPS provider is enforced; local testing allows localhost only', () => {
  assert.throws(() => buildMsgkartOtpRequest('+919876543210', '123456', 'LOGIN_OTP', {
    ...env, MSGKART_API_URL: 'http://invalid.example/api/v1',
  }), /official HTTPS endpoint/);
  assert.doesNotThrow(() => buildMsgkartOtpRequest('+919876543210', '123456', 'LOGIN_OTP', {
    ...env, MSGKART_API_URL: 'http://127.0.0.1:5000/api/v1',
  }));
});

test('Mock provider is permitted only in development and never performs a network request', async () => {
  const mockLogs = [];
  await sendOtp('+919876543210', '123456', 'LOGIN_OTP', {
    env: { ...env, NODE_ENV: 'development', MOCK_OTP_ENABLED: 'true' },
    logMock: message => mockLogs.push(message),
    fetcher: async () => { throw new Error('Network request should not happen'); },
  });
  assert.equal(mockLogs.length, 1);
  await assert.rejects(sendOtp('+919876543210', '123456', 'LOGIN_OTP', {
    env: { ...env, NODE_ENV: 'production', MOCK_OTP_ENABLED: 'true', MSGKART_OTP_TEMPLATE_NAME: '' },
    logMock: () => { throw new Error('Not allowed in production'); },
  }), /MSGKART_OTP_TEMPLATE_NAME/);
});


test('MSGKART timeout is configurable within safe limits, and timeouts are classified', async () => {
  const { init } = buildMsgkartOtpRequest('+919876543210', '123456', 'LOGIN_OTP', {
    ...env, MSGKART_TIMEOUT_MS: '20000',
  });
  assert.ok(init.signal instanceof AbortSignal);
  for (const invalid of ['0', '-5', '2000', '30001', 'NaN', '5.5']) {
    assert.throws(() => buildMsgkartOtpRequest('+919876543210', '123456', 'LOGIN_OTP', {
      ...env, MSGKART_TIMEOUT_MS: invalid,
    }), /MSGKART_TIMEOUT_MS/);
  }
  await assert.rejects(sendOtp('+919876543210', '123456', 'LOGIN_OTP', {
    env: { ...env, MSGKART_TIMEOUT_MS: '20000' },
    fetcher: async () => { const e = new Error('request aborted'); e.name = 'TimeoutError'; throw e; },
  }), /MSGKART API timed out after 20000ms/);
  await assert.rejects(sendOtp('+919876543210', '123456', 'LOGIN_OTP', {
    env,
    fetcher: async () => new Response('{}', { status: 401 }),
  }), /HTTP 401/);
});


test('MSGKART native HTTPS transport rejects sending keys to an untrusted host', () => {
  const { postMsgkartHttps } = require('../dist/core/msgkart-https.js');
  assert.throws(() => postMsgkartHttps('https://not-msgkart.example/api', {
    method: 'POST', headers: { 'x-api-key': 'unit-test-key' }, body: '{}',
  }), /official HTTPS host/);
  assert.throws(() => postMsgkartHttps('http://alb-backend.msgkart.com/api', {
    method: 'POST', headers: { 'x-api-key': 'unit-test-key' }, body: '{}',
  }), /official HTTPS host/);
});
