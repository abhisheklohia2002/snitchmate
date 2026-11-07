# StitchMate implementation handoff

**Status (2026-11-06): Source implementation delivered; NOT approved for production.**

This source repository contains the customer, tailor, and admin interfaces and the service-side implementation of custom-stitching and alteration bookings, quotes, test/provider checkout, order and production state transitions, two-leg courier handoff, disputes and manual finance actions. It is not a deployed application and must not accept actual funds or customer-owned fabrics yet.

## Source inventory

- Next.js App Router customer site and dashboards (`apps/web`)
- NestJS REST endpoints (`apps/api`)
- Prisma PostgreSQL data model and seed script (`apps/api/prisma`)
- Redis/BullMQ background event worker (`apps/worker`)
- Shared schema contracts and dependency-free order/price policy code (`packages`)
- Docker Compose, deployment template, setup guide and product specification

## Verified during source creation

- TypeScript syntax parse: **54 `.ts`/`.tsx` files, zero syntax diagnostics**.
- Relative module resolution audit: **0 missing relative imports**.
- Order policy tests: **8 passed, 0 failed** (pure JS transpiled from TypeScript via global compiler).
- Razorpay webhook HMAC: **valid signature accepted, changed payload and malformed signatures rejected** via a direct runtime check.
- Payment webhook de-duplication uses the provider's `x-razorpay-event-id` header in source.

## Not run / not verified

- Dependency install, full typecheck, ESLint, Next.js production build, NestJS build, Prisma generate/migrations, Docker integration, Playwright/browser E2E, actual Razorpay sandbox delivery or full authorization penetration testing. This environment cannot resolve the npm registry and does not provide Docker.
- No published website, cloud database, provider credentials or real logistics integrations.

## Strict production gate

Run `pnpm install`, `pnpm db:generate`, `pnpm --filter @stitchmate/api exec prisma migrate dev --name initial_schema`, `pnpm db:seed`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test` in a normal machine with accessible registry, Docker services and separate test credentials. Fix **all** resulting type/build/integration errors, commit lockfile and migration, and complete `LAUNCH_CHECKLIST.md` before even a limited real-money pilot.

**Security and finance blockers:** real OTP provider/DLT compliance, provider onboarding, refunds and payment reconciliation, financial ledger / invoicing / GST treatment, uploads malware scan, privacy/custody/compensation agreements, courier training and proof, data retention, backup/restore and monitoring. See `STATUS.md` for full detail.
