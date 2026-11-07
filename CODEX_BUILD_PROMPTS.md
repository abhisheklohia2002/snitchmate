# StitchMate - Copy/Paste Codex Implementation Prompts

The recommended workflow is to place `STITCHMATE_PRODUCT_SPEC.md` and `AGENTS.md` at your repository root and implement **one phase per Codex session or task**. Review each diff and test result before proceeding to the next phase.

## Master setup prompt (use first)

```text
You are my senior full-stack architect and implementation partner for StitchMate, an India-based tailoring marketplace. First read the complete STITCHMATE_PRODUCT_SPEC.md and AGENTS.md in the root of this repository. We support (1) custom stitching using fabric supplied by customers and (2) alterations of existing garments. We operate doorstep pickup from customer to tailor and return delivery from tailor to customer.

Tech stack: TypeScript-only monorepo with Next.js App Router, Tailwind and accessible UI, NestJS API, PostgreSQL with Prisma, Redis/BullMQ jobs, private S3-compatible media storage, and Razorpay sandbox behind a payment-provider interface. Do not create Go/Python services, microservices, native apps, or AI measurements. Initial payouts may be manual, because split-payout approval cannot be assumed.

IMPORTANT: Inspect the repository FIRST: tree, lockfile, package scripts, existing components and architecture. Do not overwrite existing implementation or modify functionality without evaluating what exists. Tell me what is already implemented, what's missing from the spec, risky assumptions and a phase-by-phase implementation plan. Propose database entities, frontend routes, backend modules and a small first task. Do not build all phases in one pass.

Build for three roles: customer, tailor and admin, with light courier operations in the admin tool. Enforce ownership and tenant authorization on the server. Use integer paise, immutable accepted quotes, measurement snapshots, separate order/payment/logistics statuses, webhook idempotency and explicit custody handoffs.

For each task provide: plan, changed files, commands executed, test results, remaining mocks and next steps. Begin with Phase 0 repository audit and foundations only.
```

## Phase 0 prompt: foundation

```text
Implement Phase 0 of STITCHMATE_PRODUCT_SPEC.md only. Start with an audit of the repository and reuse existing code where possible. Set up or verify pnpm workspace structure, Next.js web, NestJS API, shared contract package, strict TS, lint/typecheck/unit-test scripts, local PostgreSQL and Redis in docker-compose, Prisma schema baseline, .env.example and seed data for service categories/tailors. Add simple responsive customer, tailor and admin route shells, but NO fake payment success UX. Add startup docs and CI checks. Run all checks and report results. Do not continue to Phase 1.
```

## Phase 1 prompt: auth and marketplace discovery

```text
Implement Phase 1: OTP login abstraction with safe local mock and production provider interface, secure sessions, RBAC, object ownership checks, customer addresses, service zone verification, tailor onboarding and admin approval, tailor service catalog, portfolios and discovery listings. Tailors must be verified and within a serviceable zone before appearing. Build mobile-first screens for landing, service catalog, tailor listing/profile and admin approval. Add DB migrations, APIs, seed fixtures, tests for role isolation and pagination. Keep existing design and functionality. Report tested routes and remaining mocks. Stop after Phase 1.
```

## Phase 2 prompt: stitching and alteration booking

```text
Implement Phase 2: custom-stitching and alterations request builder. A customer can create a one-tailor multi-item draft, upload private reference photos, select garment options, add required measurements or declare a fitting sample, and request a quote. Build customer measurement profiles with immutable versions; snapshot measurements when a quote is accepted. Tailor can accept/reject a request and issue an itemized quote with immutable revisions and expiry; customer may accept only the latest valid quote. Implement domain transitions and audit timeline with transactional checks. Add web screens and API/unit/E2E tests, especially ownership, stale quotes and invalid transitions. No actual payment or logistics integration in this phase. Stop when done.
```

## Phase 3 prompt: checkout and two-leg logistics

```text
Implement Phase 3: Razorpay sandbox checkout behind a provider interface, backend-generated payment orders, raw-body verified webhooks, provider event deduplication, idempotent payment transitions and explicit failure/retry behavior. Paid orders can schedule inbound pickup; admin creates and assigns inbound customer->tailor logistics jobs and records OTP/photo custody handoffs. After quality approval, a separate outbound tailor->customer job is created. Support courier failure attempts and reschedule, and show clear customer order timeline. Build and test happy path plus duplicate webhook, failed handoff, tampered payment and non-serviceable address. Never claim simulated events are live transactions. Stop after Phase 3.
```

## Phase 4 prompt: tailors, claims and finance

```text
Implement Phase 4: tailor material receipt and discrepancy exceptions, work milestones, photo evidence, customer-approved quote amendments, QC, outbound dispatch prerequisites, customer confirmation of delivery, correction/alteration claims, configurable cancellation/refund policies, platform commission ledger and audit-controlled tailor payout approval. Start with manual payout recording and provider interface; do not implement Razorpay Route transfers unless the merchant is confirmed eligible and credentials are available. Add reconciliation views, dispute queue and security tests. Verify there is never a double payout or unauthorized pricing edit. Stop after Phase 4.
```

## Phase 5 prompt: launch hardening

```text
Implement Phase 5: complete mobile E2E journeys, seed realistic demo data without impersonating real customers, accessibility audit, slow network/failed image upload behavior, background notification retries, rate limiting, operational metrics, error reporting, backup/restore runbook, privacy/terms route shells, and deployment scripts with staging/production configuration separation. Produce a release checklist and identify all legal/payment/logistics matters that must be validated outside code. Run tests, typecheck, lint, build and summarize unresolved blockers. Do not claim production-ready if any blocking acceptance criterion is unmet.
```

## Useful follow-up prompt: architecture/code review

```text
Review the changes just completed against AGENTS.md and STITCHMATE_PRODUCT_SPEC.md. Find: broken RBAC, unsafe direct DB changes, stale order statuses, amount calculations using floating point, quote mutation after acceptance, insecure private-photo access, missing payment webhook verification, duplicate payout risks, missing courier handoff proof, unhandled cancellations, and UI regressions. Rank findings by severity with file/line references. Fix critical issues with tests and rerun checks. Do not expand feature scope.
```

## Useful follow-up prompt: generate an execution backlog

```text
From the existing repo and STITCHMATE_PRODUCT_SPEC.md, generate docs/backlog.md as a prioritized list of independent tickets grouped by phase. Each ticket needs objective, route/API/DB touches, edge cases, dependencies, definition of done, tests and a rough relative size (S/M/L). Prefer vertical slices that are demonstrable end-to-end. Mark anything requiring payment-provider access, tax advice or courier contracts as external blocker rather than inventing an implementation.
```
