# Pilot operations runbook

## Onboard tailor

- Verify business name, address, owner, operating hours, experience, and garment samples outside the app.
- Tailor registers `/tailor/onboarding`, adds services and prices.
- Admin reviews `/admin/tailors` and writes meaningful verification notes before approval.
- Approved tailors become searchable only in serviceable pincodes.

## Incoming fabric

- Customer accepts itemized quote, pays, schedules one inbound pickup.
- Admin assigns a verified courier and checks collection time and piece count.
- At sender pickup send an OTP to the sender, photograph condition and record package seal ID.
- On tailor receipt confirm same package seal, item count, new OTP and condition photo.
- Tailor must record any shortage/damage before work. `MATERIAL_ISSUE` pauses production pending admin review.

## Quality and return

- Tailor receives garment, confirms its suitability, records in-progress milestones and a finished photo per item.
- Admin approves only after physically inspecting/confirming quality. A separate outbound job is created.
- Verify pickup at tailor and delivery to customer, each with OTP/photo proof.
- Customer confirms the delivered garment. Fit claims can be opened during configured window.

## Claims

- Inspect order events, handoff condition photos, customer instructions and final QC evidence.
- Either reject with reason, approve supervised rework, or escalate to refund review.
- **Do not** promise or mark an actual refund from StitchMate simply because finance approved a record. Use the merchant/provider bank dashboard, verify processed status and transaction reference, then record completion in finance.
- For loss/damage, preserve evidence and apply reviewed customer compensation terms.

## Payout

- After order completion and claim window, finance prepares a single payout record.
- Finance checks disputes and tax advice before approval.
- Send actual payment externally through approved banking/payment provider. Record the **real** transfer reference only after confirming it was executed.
- Never invent settlement references or mark a paid status in order to satisfy a dashboard metric.
