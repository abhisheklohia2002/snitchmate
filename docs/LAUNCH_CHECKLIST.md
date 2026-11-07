# StitchMate launch gate

All critical items must be checked before collecting real money or customer fabric.

- [ ] `pnpm install`, full typecheck, lint, and production build pass
- [ ] Commit lockfile and baseline Prisma migrations; staging migration/rollback tested
- [ ] Both stitching and alterations pass real Postgres/Redis/S3 browser E2E tests
- [ ] Negative tests: RBAC/tenant isolation, quote races, stale quote, duplicate webhook, forged payment, double payouts, invalid handoff, refunds
- [ ] Private file AV scanning/validation, CORS, policy retention and PII access reviewed
- [ ] SMS OTP provider working; per-phone/IP/device abuse prevention and legal templates validated
- [ ] Razorpay merchant test/live approval and webhook verification/reconciliation tested
- [ ] Actual refund provider process and bank payouts verified; tax/invoicing ledgers reconciled
- [ ] Tailor KYC and workshop verification procedures in place
- [ ] Customer-owned material custody contract, privacy/terms/refund/fit policy finalized
- [ ] Real delivery partners trained, tamper seals and standard pickup/return procedures in place
- [ ] Customer support contact and escalation hours publicly published
- [ ] Live HTTPS domain, error monitoring, alerting and secure secret storage in place
- [ ] Automated backup **restore test** passed; incident response owner assigned
- [ ] Staging and production have isolated payment keys, databases, buckets and allowed origins

**If any box is unchecked, stay in private sandbox/pilot with no real financial or material commitments.**
