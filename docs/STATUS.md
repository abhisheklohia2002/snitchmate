# Implementation status — source artifact, November 2026

**Not yet production-ready or verified on a running stack.** This document is an engineering truth table, not a claim that a feature is deployed.

## Implemented in source code

- pnpm workspace with Next.js web, NestJS API, Prisma data model, Redis/BullMQ worker, private S3-compatible photo registration/access, and local Compose services.
- Responsive public site, service directory, verified tailor search/details, OTP sign-in, addresses, saved measurement profiles, stitching/alteration request form with multi-garment staging, order tracking and quote accept/checkout.
- Tailor onboarding, service catalog, request accept/decline, quote revisions, material receipt, progress photos, QC handoff and earnings.
- Admin tailor review, order queue, two courier legs, OTP handoffs with photos, failed attempts, claim review, money/transfer records and audit.
- Backend domain transitions with optimistic updates, quote version verification, server-side total calculation, integer paise, OTP session cookies, provider-verified payments, webhook deduplication, local simulated payments, and manual money operations.
- Developer seed for service areas/catalog/admin/courier, and outbox notification worker.

## Tested in artifact environment

- TypeScript parser: **all TS/TSX sources parse with no syntax errors**.
- Pure TypeScript domain rules: **8 node:test tests passed**, using a global TypeScript transpilation because dependencies could not be installed.
- The actual NestJS/Prisma/Next runtime, database migrations, live gateway and visual UI **were not run**. All 54 TypeScript/TSX files parsed successfully, all relative imports resolved, and a direct HMAC signature/tampering check passed.

## Blocking items before a public launch

1. **Installation/reproducibility:** Run `pnpm install`, generate/check-in lockfile, run lint/typecheck/build on full dependency graph, and commit reproducible Prisma migrations.
2. **Database and E2E:** Use a real PostgreSQL, Redis, S3 and browser to test both full order flows and all negative scenarios. Run concurrency tests for quotes, refunds, claims, payments and payouts.
3. **File safety:** Content-based file scanning, media image sanitization, quotas, metadata stripping, secure preview access and retention policy. Current HEAD/type checks are **not malware scans**.
4. **OTP & anti-abuse:** Obtain approved SMS provider and DLT/template compliance, add Redis IP/device throttles and monitoring, and test OTP delivery/abuse.
5. **Payment provider:** Approved Razorpay account, test/live keys, webhook deliveries/retries, reconciliation, refunds and payout-provider rules. Manual refund/transfer records do not initiate actual funds movement.
6. **Finance:** Accounting-ledger reconciliation, GST/TCS/invoice requirements reviewed with a qualified accountant; configurable tax calculations by supplier/tax status before live charging.
7. **Logistics:** Real courier onboarding, parcel labels and seals, phone confirmation, practical exception handling, and insurance/compensation policies. No automated courier partner integration.
8. **Legal & customer trust:** Privacy, cancellation, fit-correction, fabric-loss and refund policies with business identity, verified support details, consent and retention periods.
9. **Operational reliability:** Alerting, database backups and **successful restore drill**, incident response, staging/prod isolation, HTTPS and tested deployment.
10. **Feature gaps:** Customer-approved paid amendments, real refund execution, bank payout execution and end-to-end rework automation need further development/integration; do not use those flows with live money until resolved.

## Known MVP limitations

- Orders contain multiple garments but only one tailor and one service type per order.
- Home and tailor list artwork is CSS/icon based rather than real verified portfolio photography.
- Tailor approval is manual; KYC/vendor verification must happen out-of-band during the pilot.
- Courier assignment requires a user seeded/granted the `courier` role; admin UI does not onboard courier identity.
- Local pickup fees and trial commissions are assumptions; verified tax classification and actual pricing are external decisions.
- Data is not deployed and has no real customer production records.
