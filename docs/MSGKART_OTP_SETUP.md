# MsgKart WhatsApp OTP integration (StitchMate)

StitchMate can send **WhatsApp OTP messages** through MsgKart while generating, storing, expiring and verifying the codes in its own PostgreSQL-backed authentication service. The same adapter is used for courier handoff OTPs. **MsgKart is not an SMS provider in this configuration.**

## Supported configuration

Use a **new, authorized and rotated** MsgKart key. Do not reuse or commit credentials disclosed in chat. Put the following into the existing root `.env`, not into Git:

```dotenv
# Set this mode instead of `webhook` to deliver via WhatsApp
SMS_PROVIDER=msgkart
MOCK_OTP_ENABLED=false
NEXT_PUBLIC_OTP_CHANNEL=whatsapp

# The old v1 base URL is normalized to the official v3 message endpoint by the adapter.
MSGKART_API_URL=https://alb-backend.msgkart.com/api/v1
MSGKART_BUSINESS_ID=YOUR_AUTHORIZED_BUSINESS_ID
MSGKART_API_KEY=YOUR_NEW_ROTATED_API_KEY
MSGKART_PHONE_ID=YOUR_AUTHORIZED_PHONE_NUMBER_ID

# Exact approved template name (not a numeric template ID) and matching locale.
MSGKART_OTP_TEMPLATE_NAME=stitchmate_login_code
MSGKART_HANDOFF_TEMPLATE_NAME=stitchmate_handoff_code
MSGKART_OTP_TEMPLATE_LANGUAGE=en_US
MSGKART_OTP_BUTTON_MODE=copy_code
```

Replace template names with **actual approved** names from your MsgKart account. `MSGKART_HANDOFF_TEMPLATE_NAME` is optional; without it, the login template is used for handoffs, but only do that if its approved copy is appropriate for both purposes. `SMS_WEBHOOK_URL`/`SMS_WEBHOOK_KEY` are not used when `SMS_PROVIDER=msgkart`.

## Before testing real WhatsApp messages

1. Confirm that you are authorized to use the specified account and WhatsApp number for StitchMate and that customers explicitly request delivery to their WhatsApp number.
2. In MsgKart, create / select a WhatsApp **AUTHENTICATION** template and wait for approval. Copy its template **name** and precise locale. The provider's v3 Single Message endpoint requires a template name, not an SMS Flow template ID.
3. If the approved authentication template includes an OTP copy-code button, leave `MSGKART_OTP_BUTTON_MODE=copy_code`. The adapter supplies the code to the body and a button component with `sub_type=url`. Provider-specific compatibility of the button still needs an authorized sandbox/live test.
4. If you have an approved body-only template and MsgKart supports sending it in your account, use `MSGKART_OTP_BUTTON_MODE=none`. **Do not use an unapproved marketing template for login codes.**
5. Keep `OTP_SECRET` and `SESSION_SECRET` as distinct, strong random secrets. Set `MOCK_OTP_ENABLED=false` for real delivery. Retain `MOCK_PAYMENT_ENABLED=true` during local testing.
6. Run `pnpm typecheck && pnpm build && pnpm test`, then `pnpm dev` and request OTP at `http://localhost:3000/login`. Check that an approved WhatsApp template is sent to your authorized test number and that the OTP is verified once. Check handoff OTP from admin logistics too.
7. Confirm failed/blocked WhatsApp delivery and network timeouts fail safely. Message acceptance **does not guarantee delivery**; MsgKart supports separate delivery status reporting.

**API reference:** https://developers.msgkart.com/docs/Getting%20started/WhatsApp%20Business%20API/whatsapp/

### Implementation details

- Endpoint: `POST https://alb-backend.msgkart.com/api/v3/message/{businessId}/template`
- Auth header: `x-api-key` (never as a URL parameter)
- Body: template name, language, components with the 6-digit code, `to` without `+`, and `phoneNumberId`
- The API must acknowledge with a `transactionId` or `messageId`. A 2xx without an accepted ID is treated as a failure.
- On provider failure, the freshly created OTP challenge is deleted rather than leaving an undelivered code usable.
- Server-side OTP hashing, five-minute expiry, attempt limits and sessions are unchanged.

**Integration status:** Implementation and offline mocked-provider tests provided; a real MsgKart response and approved template have not been verified. No live messaging was performed by this artifact.


## Troubleshooting a provider request timeout

`The operation was aborted due to timeout` in `POST /api/v1/auth/otp/request`
comes from the MSGKART network request. The default is now 20 seconds and can be
configured with `MSGKART_TIMEOUT_MS=20000` (allowed: 3000-30000). Longer timeouts
are **not a substitute** for fixing DNS, TCP, TLS, firewall, or provider-side latency.

Run this connectivity test on the **same machine where the API runs**:

```bash
curl -sS -o /dev/null -w 'HTTP=%{http_code} connect=%{time_connect}s total=%{time_total}s\n' --connect-timeout 5 --max-time 15 https://alb-backend.msgkart.com/
```

Any HTTP status means that a response arrived; `curl` code 28 indicates a timeout;
code 6 indicates DNS failure. This test does **not** authenticate or send an OTP.

If the host is reachable but sending OTP still times out, verify the account's
approved template name/language and service status with MSGKART support. Do not
paste API keys, real phone numbers, OTP values, or full request payloads into
issue reports or chat. Do not automatically retry ambiguous OTP sends, since a
provider may accept a message despite a client timeout.
