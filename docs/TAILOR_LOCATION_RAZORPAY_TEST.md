# StitchMate location approval and Razorpay test checkout

## What this update changes

- A tailoring shop owner can submit an exact workshop map pin from `/tailor/location` by clicking the map, entering coordinates, or using GPS **while physically at the workshop**.
- Coordinates stay in separate `pendingLatitude` / `pendingLongitude` fields. The customer map sees only `latitude` / `longitude` that already have `locationVerifiedAt`.
- An admin can approve or reject pending pins in `/admin/tailors`; approvals require verification notes and an APPROVED shop. Admin manual overrides still exist and clear pending proposals.
- Razorpay checkout now exposes backend payment mode at `/api/v1/payments/mode`. It explains why Razorpay popup is absent when mock payments are enabled.
- When switching from `DEV_MOCK` to `RAZORPAY`, an old pending mock checkout no longer blocks creation of a fresh Razorpay test order. A test-only guard prevents accidentally using live credentials in local development.
- Razorpay order creation uses a bounded native HTTPS request, avoiding problems observed with Node's fetch client on some local environments. SSL verification remains enabled; secrets are not logged.

## Apply (preserve current database and .env)

From the existing project root:

```bash
unzip -o ~/Downloads/StitchMate_Location_Approval_Razorpay_Fix.zip -d /tmp/stitchmate-location-update
python3 /tmp/stitchmate-location-update/StitchMate_Location_Approval_Razorpay_Fix/apply_update.py .

pnpm db:generate
pnpm --filter @stitchmate/api exec prisma migrate deploy
pnpm db:generate
pnpm typecheck
pnpm build
pnpm test
pnpm dev
```

Never run `prisma migrate reset` on an existing database. If migration history from your earlier ZIP is missing, restore the exact previously applied migration directories before deploying. Back up any important DB before applying migrations.

## Test tailor self-service location (two browser sessions)

1. Login as an approved tailor. Open `http://localhost:3000/tailor/location` (also linked in the tailor dashboard).
2. Use GPS only at the real shop or click the exact shop point on OpenStreetMap. Submit coordinates.
3. Tailor sees **Location review pending**. The previously verified pin (if one exists) must stay on the customer map; a first-time unverified pin must not appear.
4. Login as admin in another browser. Open `http://localhost:3000/admin/tailors`.
5. Review the submitted location against the physical address; enter at least 10 characters of verification notes. Click **Approve location**.
6. Login as customer. Open `http://localhost:3000/tailors`, choose the serviceable pincode, inspect map. Pin appears after approval, not before.
7. Repeat with a changed location, choose **Reject location**. Public pin remains unchanged and a new submission can be made.
8. As a security check, try to submit another shop's ID from a non-owner account. API must reject it. A tailor must not be able to call admin approval APIs.

Existing admin-managed pin setting remains available under **Admin manual map-pin override**.

## Fix the Razorpay popup (test payments only)

Check the API process's environment, not just `apps/web/.env.local`:

```env
MOCK_PAYMENT_ENABLED=false
ENABLE_DEMO_PAYMENT_CONFIRM=false
RAZORPAY_KEY_ID=rzp_test_YOUR_TEST_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_TEST_SECRET
RAZORPAY_WEBHOOK_SECRET=YOUR_SEPARATE_TEST_WEBHOOK_SECRET
```

Use credentials belonging to a merchant account you are authorized to test. Rotate credentials previously shared in chat or leaked in logs; never paste them into issues, screenshots, or ZIPs.

Restart `pnpm dev` after updating `.env`. Query safely:

```bash
curl -s http://localhost:4000/api/v1/payments/mode
```

Expected for Razorpay test keys:

```json
{"mode":"razorpay_test","checkoutAvailable":true}
```

Possible other values: `demo`, `unconfigured`, `live_keys_blocked`, `invalid_key_id`.

Navigate as customer to an order with an **accepted quote** (status `QUOTE_ACCEPTED`, `PAYMENT_PENDING`, or `PAYMENT_FAILED`) and open `/checkout/<order-id>`. It must say `Razorpay TEST checkout` and show `Open Razorpay secure checkout`. Clicking creates a test Razorpay order and opens Standard Checkout (script `https://checkout.razorpay.com/v1/checkout.js`). If not, read the error shown on the page and inspect browser Network tab for the order API and checkout.js. Browser blockers may block third-party scripts.

**Important**: Checkout success alone does not mark the order PAID. The app currently transitions to PAID through a verified `payment.captured` webhook. For localhost testing, you must configure a secure public HTTPS callback tunnel and a TEST Razorpay webhook that reaches `POST /api/v1/webhooks/razorpay` with the matching webhook secret, or use an isolated mock payment test. Do not fabricate paid states or expose real payment secrets. Check the dashboard's webhook delivery log and order payment status independently. Never use live keys for a local test.

## Verification limits

Source-level TypeScript/TSX syntax validation and installer preservation tests were performed; full workspace `pnpm typecheck`, `pnpm build`, Prisma migration against your DB, Razorpay test transactions, and WhatsApp delivery must be checked on your own running environment.
