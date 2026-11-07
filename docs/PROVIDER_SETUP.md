# StitchMate final provider setup: MSGKART, Twilio WhatsApp and Razorpay

These are three **different integrations**. **No API credentials are in the repository or ZIP.** The credentials previously posted to chat (including company keys) should be treated as exposed and rotated. Use only a new, separately authorized StitchMate account for each provider.

## 1. Login and courier handoff verification: MSGKART WhatsApp

StitchMate generates its own short-lived six-digit OTP, stores only a keyed hash, enforces attempt limits and sets a server session after verification. MSGKART **only delivers** login and handoff codes via an approved WhatsApp authentication template; this is *not* SMS.

Put these entries in the root `.env`:

```env
SMS_PROVIDER=msgkart
MOCK_OTP_ENABLED=false
NEXT_PUBLIC_OTP_CHANNEL=whatsapp
MSGKART_API_URL=https://alb-backend.msgkart.com/api/v1
MSGKART_BUSINESS_ID=YOUR_STITCHMATE_BUSINESS_ID
MSGKART_API_KEY=YOUR_NEW_PRIVATE_API_KEY
MSGKART_PHONE_ID=YOUR_REGISTERED_WHATSAPP_PHONE_ID
MSGKART_OTP_TEMPLATE_NAME=YOUR_APPROVED_LOGIN_TEMPLATE_NAME
MSGKART_HANDOFF_TEMPLATE_NAME=YOUR_APPROVED_HANDOFF_TEMPLATE_NAME
MSGKART_OTP_TEMPLATE_LANGUAGE=en_US
MSGKART_OTP_BUTTON_MODE=none
```

The configured base URL is automatically mapped to the official MSGKART template endpoint `POST /api/v3/message/{businessId}/template` with the `x-api-key` header. The **template name**, not a numeric SMS Flow template ID, must be configured. The documented body-only template is the default. If your approved authentication template uses a copy-code button, adjust `MSGKART_OTP_BUTTON_MODE` **only after verifying its exact components with MSGKART**, since button payload compatibility has not been verified against a real account.

Reference: https://developers.msgkart.com/docs/Getting%20started/WhatsApp%20Business%20API/whatsapp/

## 2. Order status WhatsApp notifications: Twilio

Twilio is used **only for transactional order updates**, not OTP. Customers must opt in from `/profile`. Order status notifications are generated as durable events, polled by the separate `apps/worker` process, queued by BullMQ, and sent via Twilio's Messages REST API. Authenticated customer preferences are stored in PostgreSQL as `User.whatsappNotificationsOptInAt`.

```env
NOTIFICATION_PROVIDER=twilio
TWILIO_ACCOUNT_SID=YOUR_STITCHMATE_TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN=YOUR_STITCHMATE_TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_FROM=whatsapp:+YOUR_APPROVED_SENDER_NUMBER
TWILIO_CONTENT_SID_QUOTE_READY=YOUR_APPROVED_HX_SID
TWILIO_CONTENT_SID_PAYMENT_CAPTURED=YOUR_APPROVED_HX_SID
TWILIO_CONTENT_SID_ORDER_COMPLETED=YOUR_APPROVED_HX_SID
TWILIO_CONTENT_SID_STATUS_UPDATE=YOUR_APPROVED_HX_SID
```

In Twilio's **Content Template Builder**, create *four WhatsApp-approved utility templates*, with these variable contracts:

| Template env var | Topic | Required text placeholders |
|---|---|---|
| `TWILIO_CONTENT_SID_QUOTE_READY` | `order.quote_ready` | `{{1}}` = StitchMate order number |
| `TWILIO_CONTENT_SID_PAYMENT_CAPTURED` | `payment.captured` | `{{1}}` = order number |
| `TWILIO_CONTENT_SID_ORDER_COMPLETED` | `order.completed` | `{{1}}` = order number |
| `TWILIO_CONTENT_SID_STATUS_UPDATE` | `order.status_changed` | `{{1}}` = order number, `{{2}}` = status |

Sample template text (to submit for approval):
- Quote ready: `Your StitchMate order {{1}} has a new quotation available. Open StitchMate to review it.`
- Payment captured: `Payment for StitchMate order {{1}} was received. You can schedule pickup in your account.`
- Order completed: `Your StitchMate order {{1}} is complete. Thank you for choosing StitchMate.`
- Status update: `The status of StitchMate order {{1}} is now {{2}}. Open your order page for details.`

Approved templates are sent via `ContentSid` and `ContentVariables`, not free-form `Body`. The Twilio WhatsApp sender must be registered or use the Twilio Sandbox for a linked test recipient. Twilio's `201 Created`/message SID is an **acceptance**, not a confirmed WhatsApp delivery. Use provider delivery callbacks and monitoring in production; this MVP does not persist delivery receipts.

References:
- https://www.twilio.com/docs/content/send-templates-created-with-the-content-template-builder
- https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates

Start in a separate terminal: `pnpm dev:worker`. The worker must be running for WhatsApp order updates to send.

## 3. Checkout: Razorpay

The existing checkout, payment confirmation and verified webhook handling remain unchanged. For an independent StitchMate-owned Razorpay **test-mode merchant**:

```env
MOCK_PAYMENT_ENABLED=false
ENABLE_DEMO_PAYMENT_CONFIRM=false
RAZORPAY_KEY_ID=YOUR_NEW_TEST_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_NEW_TEST_SECRET
RAZORPAY_WEBHOOK_SECRET=YOUR_NEW_TEST_WEBHOOK_SECRET
NEXT_PUBLIC_RAZORPAY_KEY_ID=YOUR_NEW_TEST_KEY_ID
```

Use Razorpay's test dashboard to configure an HTTPS-accessible webhook to `/api/v1/webhooks/razorpay`; the local backend can be exposed via an authorized HTTPS tunnel for local testing. Browser callbacks must never set an order to paid, only verified backend events may. The key ID is public, while the key secret and webhook secret remain server-side. Tailor payouts and actual refunds are still **manual administrative workflows**, not real API payouts/refunds.

Never paste live keys into an assistant chat or commit them to Git.

## Existing StitchMate database: preserve your existing data

You previously ran Prisma migrations and seeds. This version adds an opt-in column and **does not require resetting the database**. From the project root:

```bash
./scripts/bootstrap-env.sh
pnpm install
pnpm db:generate
pnpm --filter @stitchmate/api exec prisma migrate dev --name whatsapp_notification_consent
pnpm typecheck
pnpm build
pnpm test
pnpm dev
# in a second terminal
pnpm dev:worker
```

If your existing database has local generated migration history, keep your existing `apps/api/prisma/migrations/` and migrate *that* database; **do not delete that folder or replace the entire working directory**. You can copy only changed application files from this ZIP into your existing project, retaining `.env`, migrations, lockfile and Docker volumes.

## Local tests without provider access

For a local demonstration, these settings show fake OTP in the API terminal and simulate payment (no real money):

```env
NODE_ENV=development
SMS_PROVIDER=mock
MOCK_OTP_ENABLED=true
NOTIFICATION_PROVIDER=mock
MOCK_PAYMENT_ENABLED=true
ENABLE_DEMO_PAYMENT_CONFIRM=true
```

Production validation rejects mock OTP and mock payment, and the WhatsApp worker rejects mock notifications in production. **Full provider tests, account approval, legal/tax review, security and real-customer pilot are still required for production readiness.**
