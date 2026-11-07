# Architecture decisions

1. **TypeScript-only modular monolith:** single NestJS transactional owner, with isolated notification worker. Shared `@stitchmate/domain` for rules.
2. **One tailor per order:** prevents unmanageable cross-vendor pickups. Multiple garments per order supported.
3. **Separate order, payment, production and logistics statuses:** one status cannot substitute for completed custody proof.
4. **Money in integer paise:** serialize BigInt as decimal JSON strings; never treat money as floating point.
5. **Sandbox-first payment setup:** server webhook verification, unique provider event IDs, no browser-proclaimed success.
6. **Provider-agnostic payout:** platform admin manual payout after completion/dispute checks. No unapproved split payments.
7. **MVP admin-managed couriers:** assignments and real proof records; no fictitious GPS or external courier API.
8. **Customer supplies material:** no fabric stock or platform ownership.
9. **Production blockers:** verified live OTP, payments/payout onboarding, logistics staff, contracts, tax and privacy reviews, S3, secrets, backup/restore and staging verification.
10. **No false production readiness:** code that compiles is not sufficient to accept customer money or fabric.
