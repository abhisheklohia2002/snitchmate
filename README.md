# StitchMate — tailoring marketplace MVP (source)

**Status: implementation preview / not cleared for accepting real customer money or fabric.**

StitchMate connects customers who provide their own fabric or garments with verified nearby tailors. It supports custom stitching and alterations, an accepted-quote checkout, two-leg doorstep logistics, material custody records, QC, fitting claims, and manual payout/refund operations.

The repository extends the original project files supplied by the product owner. The source of truth remains `STITCHMATE_PRODUCT_SPEC.md` and `AGENTS.md`.

## Technology

- **Frontend:** Next.js 15, App Router, React 19, TypeScript, responsive custom CSS, lucide icons
- **Backend:** NestJS 10 REST modular monolith, Zod request validation
- **Data:** PostgreSQL 16, Prisma 6, integer paise / bigint
- **Jobs:** Redis 7, BullMQ, durable PostgreSQL outbox, notification worker
- **Private uploads:** S3 API / local MinIO with presigned uploads
- **Payments:** Razorpay API sandbox/live-capable adapter; HMAC-verified webhook with durable replay protection
- **Authentication:** six-digit OTP, DB-backed HttpOnly sessions, role/tenant authorization
- **Local infrastructure:** Docker Compose (PostgreSQL, Redis, MinIO)

## Read before running

Code has been syntax-parsed and domain-rule tests passed in the artifact creation environment. Full Nest/Next builds, Prisma migrations, Docker integration tests, and browser E2E tests **could not be run** there because npm registry resolution and Docker were unavailable. Live OTP, payment merchant onboarding, bank refunds, payout eligibility, verified image malware scanning, customer policy documents and operational partners are not supplied. See `docs/STATUS.md` and `docs/LAUNCH_CHECKLIST.md`.

## Local quickstart (Linux / macOS / WSL)

Requirements: Node.js 22+, Corepack/pnpm 10.8.1, Docker Engine + Docker Compose, ability to access the npm registry.

```bash
cd stitchmate
corepack enable
corepack prepare pnpm@10.8.1 --activate
./scripts/bootstrap-env.sh
# Edit .env, add a demo ADMIN_BOOTSTRAP_PHONE and COURIER_BOOTSTRAP_PHONE.
pnpm install --no-frozen-lockfile
docker compose up -d
pnpm db:generate
pnpm --filter @stitchmate/api exec prisma migrate dev --name initial_schema
pnpm db:seed
pnpm build
pnpm typecheck
pnpm test
pnpm dev
```

**Important:** commit the newly created Prisma migrations and `pnpm-lock.yaml` after successful install and code review. Do not use `prisma db push` for a live database.

The web frontend runs at http://localhost:3000 and NestJS at http://localhost:4000/api/v1. On a first local run the approved-tailor directory is intentionally empty: an actual tailor account must be registered and approved by a seeded admin.

### Environment / secrets

The root `.env` is linked into each app using `scripts/bootstrap-env.sh`, never committed. Give `SESSION_SECRET` and `OTP_SECRET` distinct, strong random values. The example values are placeholders. The local dev OTP provider (`MOCK_OTP_ENABLED=true`) prints OTP codes to the **API terminal only** and cannot be enabled under `NODE_ENV=production`. The development payment simulator similarly runs only outside production.

Before public deployment use a verified SMS webhook, real approved merchant credentials, managed private storage and signed URL scanning, documented policies, and secure HTTPS deployment. The current code is not a substitute for provider eligibility, tax or legal review.

## MsgKart WhatsApp OTP

The optional MsgKart WhatsApp authentication adapter is configured using `SMS_PROVIDER=msgkart` and the `MSGKART_*` environment variables. It uses the provider's WhatsApp v3 send-template API, **not SMS**. Read [docs/MSGKART_OTP_SETUP.md](docs/MSGKART_OTP_SETUP.md) for the approved-template requirement, sandbox verification, and credentials setup. Shared credentials are deliberately not included in this source code.

## Messaging: MSGKART login + Twilio order notifications + Razorpay

- **Login and courier handoff OTP:** MSGKART WhatsApp approved authentication template via `SMS_PROVIDER=msgkart`. The code stays server-generated, short-lived and single-use. MSGKART is used only for OTP in this integration.
- **Transactional WhatsApp updates:** Twilio Content API through the BullMQ worker for quote-ready, payment captured, milestone changes and order completed. Requires the customer's explicit opt-in in `/profile`; business-initiated messages require approved Twilio Content SIDs. Launch the separate worker with `pnpm dev:worker`.
- **Checkout:** Existing Razorpay order creation and HMAC webhook verification are unchanged. Use merchant-specific **test** credentials with `MOCK_PAYMENT_ENABLED=false` to exercise Razorpay sandbox; only verified backend events mark payments captured.
- **No credentials are included in the ZIP.** Configure a separate, authorized StitchMate MSGKART/Twilio/Razorpay account in the untracked `.env`; rotate any values previously published in a chat.
- **Existing installations:** after editing `.env`, run `pnpm db:generate` and `pnpm --filter @stitchmate/api exec prisma migrate dev --name whatsapp_notification_consent` to add the opt-in column; avoid resetting the existing database.
- To test locally without messaging accounts, set `SMS_PROVIDER=mock`, `MOCK_OTP_ENABLED=true`, and `NOTIFICATION_PROVIDER=mock` (development only). Real delivery is not guaranteed merely because providers accept a request.

See [docs/PROVIDER_SETUP.md](docs/PROVIDER_SETUP.md) for exact variables and event-template mapping.

## Test the full local flow

1. Sign in as the `ADMIN_BOOTSTRAP_PHONE` account and as `COURIER_BOOTSTRAP_PHONE` in separate browsers (OTP printed in API terminal). Seed creates admin and courier roles.
2. Sign in from a third number, open `/tailor/onboarding`, add workshop details and at least one service, then have the admin approve the tailor under `/admin/tailors`.
3. Sign in from a customer number, add an address on `/profile` (serviceable pilot postcode) and measurements on `/measurements` if stitching.
4. Browse `/tailors`, choose a tailor, create a custom-stitching or alteration order with required photos, and request an itemized quote. For alterations **before photos** are mandatory; stitching needs either a measurement profile or a fitting sample.
5. Tailor accepts request from `/tailor/requests`, sends a quotation from `/tailor/orders/[id]`. Customer accepts the latest valid quote and checks out.
6. In local mock payment mode, the checkout page clearly says **simulated payment**. Use the dev-only confirm button; no real charge occurs.
7. Customer schedules pickup from order detail. Admin uses `/admin/logistics` to assign courier, issue OTPs, upload handoff photos, and verify customer-to-courier and courier-to-tailor handovers.
8. Tailor confirms materials, uploads a finished-photo for every garment, marks work ready. Admin approves QC and a separate return-delivery job is created.
9. Admin verifies tailor-to-courier and courier-to-customer handovers. Customer confirms delivery, can review the tailor or request a fitting correction within the configured window.
10. After the correction window closes and disputes are resolved, finance prepares, approves, and **manually records** a genuine external tailor payout. The system **does not transfer bank funds by itself**.

### Distinct financial statuses

- A browser checkout success callback **never** sets an order paid. Only the server's verified payment event or a server-to-server provider confirmation can.
- Verified duplicate webhook events are stored uniquely and safely replayed.
- Refund and payout screens record human approvals and genuine **external** transaction references; these buttons do not make a bank transfer.
- All amounts are `BigInt` paise in the database, serialized as decimal strings over JSON.

## Repository

```
apps/web          Next.js customer, tailor and admin responsive interfaces
apps/api          NestJS auth, catalog, orders, payments, logistics, finance
apps/api/prisma   Prisma schema and service-zone/category seed
apps/worker       BullMQ notification outbox worker
packages/domain   Domain state machine and integer money calculations
packages/contracts Shared Zod request contracts
docs              Architecture, status, runbooks, launch gating
deploy            Example container and reverse-proxy configs
```

## Scripts

```bash
pnpm dev                   # web and API
pnpm dev:worker            # separate terminal, optional for local notification previews
pnpm build                 # compile packages and apps
pnpm typecheck
pnpm test
pnpm db:generate
pnpm db:migrate             # development migration (requires DATABASE_URL)
pnpm db:seed
```

## Security and production caveats

See `docs/STATUS.md` before trusting any feature in live use. Security-sensitive migrations and integrations require tests against **actual running services**. The MVP deliberately does not include automatic AI body measurements, fabric inventory, real-time courier GPS, live split payouts, or user-to-user messaging.
