# StitchMate - Instructions for Codex and engineering agents

You are working on StitchMate, a hyperlocal India-based managed tailoring marketplace. Read `STITCHMATE_PRODUCT_SPEC.md` before any implementation. The source of truth is that spec plus explicit user changes. Do not interpret mockups as permission to drop controls for finance, custody or privacy.

## Core objective
Build a production-oriented **TypeScript-only MVP** with Next.js App Router frontend, NestJS API, PostgreSQL, Prisma, Redis/BullMQ, private S3-compatible media storage and a provider-abstracted payment gateway (Razorpay sandbox for integration). Deliver both CUSTOM_STITCHING and ALTERATION and doorstep inbound/outbound logistics. Mobile-first UI, verifiable auth, auditable operations, transparent quotes and no assumption that Razorpay Route split payments are available.

## Before editing anything
1. Inspect existing repository, `package.json`, lockfiles, app paths, build scripts and existing UI. Summarize what exists. If a repo already exists, adapt to it instead of overwriting files or generating a conflicting project.
2. Identify the current phase and its exact acceptance criteria from `STITCHMATE_PRODUCT_SPEC.md` and `CODEX_BUILD_PROMPTS.md`.
3. List files likely to change and why. Work in a small coherent change set. Do not create a new monorepo if the existing structure can fulfill the spec without a rewrite.
4. Ask only if a blocker makes safe implementation impossible; otherwise use assumptions documented in `docs/decisions.md`.

## Software conventions
- TypeScript strict, no `any` without a written reason. Separate domain logic from controllers, provider adapters and persistence implementation.
- Prefer a modular monolith API; no Kubernetes, Kafka, extra Go/Python services or premature microservices.
- pnpm workspace; use only one ORM (Prisma preferred). Shared validated contracts across web and API.
- Money uses integer paise and explicit currency; no JS floating point for canonical ledger arithmetic.
- Use database transactions for order state changes; optimistic concurrency/version checks for competing updates.
- Preserve quote revisions and exact measurement snapshots. Accepted quotes are immutable.
- `orders.status`, `payment_status`, logistics leg statuses and production statuses are distinct. Do not use a single overloaded status enum.
- Implement a transition service and explicit policy guards, not arbitrary PATCH status update endpoints.
- Authentication: server-managed roles, object ownership, tailor tenant isolation, minimal courier data. Never rely only on hidden UI buttons as authorization.
- Private media buckets, signed URL access, upload type and size enforcement, and image permission checks.
- Verified provider webhooks with durable event dedupe and idempotent handlers. Never trust browser payment success.
- Payout creation is privileged, audited and idempotent; support manual payout workflows as the initial default.
- Inbound and outbound courier jobs are separate with custody proof, OTP and exceptions. Don't claim courier tracks exact GPS unless that provider exists.
- All API responses use consistent error schema, correlation/request IDs and pagination patterns.
- Provider calls are behind interfaces; local development uses clearly labeled fakes that cannot be enabled accidentally in production.
- No secrets in git, documentation screenshots or logs. Never commit actual customer photos, phone numbers or bank details.
- Support accessible mobile UX; English first, Hindi-friendly labels where useful.

## Product constraints
- All prices, tax rates, delivery SLAs, fitting guarantees and return windows are configurable. Do not invent contractual guarantees or legal tax classifications.
- MVP orders contain one tailor, potentially multiple garments. A multi-tailor cart is out of scope.
- Customer supplies fabric or clothes; platform does not own or sell fabric in MVP.
- Customer's selected tailor approves/requotes before the customer pays.
- Do not remove an existing functioning UI merely to match the proposed route examples.
- Never use generated placeholder customer identities as real testimonials or reviews.
- Do not add AI measurement from photos or AI design generation to MVP.

## Required testing
For each meaningful change: add/update relevant unit and API tests; execute lint, typecheck and affected tests; report exact commands and results. Essential E2E flow: new stitching order; alteration request; quote version conflict; payment success from verified webhook; inbound handoff; tailor material acceptance; production and QC; outbound handoff; customer delivery; fit correction case. Also test auth ownership, duplicate webhooks, payout double execution and rejection of invalid state transitions.

## Communication format after each phase
- Summary of implemented features and decisions.
- Changed files grouped by UI / API / DB / tests.
- How to run locally, any environment variables (never secret values).
- Commands run and exact test/build result. If not run, explicitly explain why.
- What is still mocked, incomplete or blocked.
- Proposed next phase, but do not implement it without explicit task direction when scope is extensive.

## Progress discipline
Deliver one phase at a time, keep migrations reversible where possible, use clean seed data and update docs with new assumptions. An implementation is not complete just because UI renders; verify backend state, payment accounting and custody tracking end-to-end.

## Messaging provider boundary
- MSGKART WhatsApp approved authentication templates are used only to deliver login and parcel handoff OTPs. Code generation, hashing and verification remain in NestJS.
- Twilio WhatsApp approved ContentSid templates are used for opted-in customer order notifications via the BullMQ worker, not for login OTP.
- Razorpay order creation and verified webhooks remain the payment source of truth. Never mark paid from a browser callback.
- No provider keys may be committed, logged, included in sample .env files, or copied from any unrelated company account.
