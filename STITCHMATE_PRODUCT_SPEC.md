# StitchMate - Business, Product and Engineering Specification

Version: 1.0 | Planning date: 2026-11-06 | Market: India | Status: Proposed MVP

## 1. Executive decision

StitchMate is a hyperlocal, managed marketplace for customer-owned-fabric custom stitching and alterations of existing garments. Customers select a verified tailor, provide measurements and references, accept an itemized quote, prepay online, schedule doorstep collection, follow progress and receive the finished garments at home. A marketplace operator manages tailor verification, service quality, fabric custody, two-leg logistics, disputes, refunds and tailor payments.

Initial service area: one operational zone in Delhi NCR, roughly 3-7 km from participating tailors. Onboard 5-10 tailors and run a controlled pilot before expanding. Use responsive web/PWA interfaces, not three native mobile apps. During MVP, couriers and exceptions are coordinated by an admin rather than a third-party dispatch API.

Core value proposition: trusted local craftsmanship, convenient doorstep service, documented custody of customer-owned material, transparent quotes and clear fitting-correction policies.

### MVP assumptions to validate
- All amounts and durations in this specification are configurable hypotheses, not guaranteed market prices or SLAs.
- Initial tailor platform fee: 15% of tailoring charges (excluding logistics and tax); test with pilot partners.
- Charge customers separately for pickup-and-return logistics; test INR 149 as a starting placeholder.
- Favor higher-value stitching and bundles of alterations to preserve positive order-level contribution.
- Collect payment after the tailor accepts the job and the customer accepts the quote; do not capture funds for unaccepted requests.
- No fabric inventory, no fabric selling, no automatic AI body measurement, no nationwide logistics, no instant tailor bidding and no native apps at launch.

## 2. Personas, jobs-to-be-done and access

### Customer
Discover services by pincode, compare verified tailors, upload garment photos and style references, create or choose measurement profiles, see quotes, pay, schedule pickup, track both logistics legs, request revisions, confirm delivery, leave a review and manage fitting corrections.

### Tailor (owner/staff)
Submit shop information for approval, offer supported categories, publish portfolio and catalog prices, specify coverage and capacity, accept/reject quote requests, issue itemized quotes, validate received material, log progress, upload quality photos, mark ready for dispatch, inspect correction requests and see payable amounts.

### Admin / operations
Approve onboarding, configure catalog and zones, review requests, oversee courier jobs, resolve lost/damaged material and pricing disputes, approve refunds/payouts, moderate reviews and maintain a searchable timeline/audit log.

### Courier (future or lightweight staff account)
View assigned pickup/drop tasks, verify parcel counts and seal IDs, collect sender confirmation via OTP, upload timestamped condition photos, record proof of delivery or failed attempts. In MVP an admin can perform these actions on a courier's behalf; no full external courier app needed.

### Access matrix
- Customer: only self-owned addresses, profile, photos, measurements and orders.
- Tailor staff: only their tenant/shop and assigned orders; access customer phone/address only when operationally necessary.
- Courier: only minimal recipient address/contact for assigned leg, never full measurement profile or pricing ledger.
- Admin: explicit role-scoped operational access, with sensitive reads and overrides audited.
- Finance admin: refunds, adjustments, reconciliations and payout approvals; cannot silently alter completed order pricing.

## 3. Initial service catalog

CUSTOM_STITCHING: men's shirts, trousers, kurta-pajama, women's suit, blouse, dress; expand after pilot. Customization choices are garment-specific and versioned: fit, collar/neckline, sleeves, lining, pockets, length, fastenings, embroidery and special instructions. Customer sends cloth, not necessarily a ready-made garment.

ALTERATION: length reduction, sleeve adjustment, waist resize, fitting adjustment, zipper replacement, minor repair. Customer sends an existing garment and chooses the exact requested changes; multiple changes on the same piece can be a single order item with priced line options.

Each catalog entry includes category, service type, default unit, required measurement fields, required photos, price policy (fixed or quote), estimated production time and whether a physical sample is recommended.

One customer order can contain multiple order_items for one tailor only in MVP. Multi-tailor baskets require independent orders/logistics and are out of scope.

## 4. End-to-end customer and operations journey

1. Location and availability: customer provides pickup pincode, serviceable address and requested category. Show only active, verified tailors operating in the zone and supporting the requested garment.
2. Configuration: customer selects CUSTOM_STITCHING or ALTERATION, garment category, quantity, options and photos; notes fabric type, meterage and desired fit if stitching.
3. Measurements: choose saved profile/version, supply measurements via guided form, include a known fitting sample, or request a measuring appointment where explicitly supported. Never treat courier pickup staff as professional measurement staff.
4. Tailor discovery: display expected price band, specialties, verified portfolio, approximate turnaround and reviews. Customer selects a tailor.
5. Draft request: persist an order request and each garment item; no charge yet. Tailor accepts/rejects within configured period.
6. Quote: tailor gives itemized stitching price, optional add-ons, expected ready-by window, requirements and fabric sufficiency caveats. Quote revisions are immutable. Customer explicitly accepts one quote version.
7. Payment: create provider payment order in backend for approved total (including logistics, taxes, adjustments); mark paid only from verified webhook or server-side provider confirmation. Do not trust frontend success alone.
8. Pickup booking: customer chooses available pickup slot. Admin assigns courier, generates garment parcel identifier, records expected items and material details.
9. Customer handoff: courier checks item count and optional fabric length/condition, captures customer OTP or signature, photos and tamper seal ID. Mark CUSTOMER_HANDOFF_CONFIRMED.
10. Tailor receipt: at second handoff, tailor confirms seal, item count, condition and fabric suitability. Discrepancies open an exception before production.
11. Production: tailor posts progress against milestones; if a new charge, changed design or timeline is needed, an amendment requires explicit customer approval and additional payment/refund reconciliation before work continues.
12. Quality and dispatch: tailor submits final photos/measurements checklist, seals the package and requests return pickup; admin reviews exceptions.
13. Return pickup: courier collects package with OTP/photos, marks ready for delivery and updates actual attempts.
14. Customer delivery: customer confirms OTP, package condition and receipt. Short post-delivery window permits fit complaints or damages to be reported.
15. Resolution: admin triages and approves eligible correction, reverse pickup, partial refund or rejection with documented reasoning; tailor payout follows agreed release and dispute policy.

### Specialty rules
- New stitching: required design reference or documented standard style, material/fabric amount, fit preference, measurement profile or sample item.
- Alteration: current garment photos, exact requested change, measurements as needed, declared pre-existing damage and repair feasibility.
- No platform promise that unverified self-measurements guarantee a particular fit.
- A tailor may reject unsuitable or insufficient material after receipt, but must upload photos and use a structured exception, not arbitrarily alter quoted price.
- An order cannot be marked complete while its return delivery leg is outstanding.

## 5. Key screens and UX routes

### Public and customer web (`apps/web`)
| Route | Purpose |
| --- | --- |
| `/` | Landing page, supported services, how it works, location check |
| `/services` | Stitching vs alterations, category catalog |
| `/tailors?category=&pincode=` | Filterable verified-tailor directory |
| `/tailors/[slug]` | Shop profile, portfolio, prices, ETA, reviews |
| `/book/[tailorId]` | Multi-step garment customizer and request builder |
| `/measurements` | Family/member profiles, versions, guidance |
| `/checkout/[orderId]` | Accepted quote, all price components, payment |
| `/orders` | Order history and statuses |
| `/orders/[id]` | Timeline, photos, milestones, both courier legs, help |
| `/orders/[id]/correction` | Fit/damage claim and evidence upload |
| `/profile` | Personal details, saved addresses, preferences |
| `/help` | FAQs, support cases, cancellation, refund policies |

### Tailor portal
| Route | Purpose |
| --- | --- |
| `/tailor/onboarding` | Identity, shop, bank/payout profile, specialties, documents |
| `/tailor/dashboard` | Today's queue, SLA alerts, projected earnings |
| `/tailor/requests` | Accept/reject requests and prepare quotes |
| `/tailor/orders/[id]` | Material intake, measurements, production milestones, photos |
| `/tailor/services` | Catalog availability, pricing, capacity, blackout dates |
| `/tailor/portfolio` | Before/after work samples (with customer permission) |
| `/tailor/earnings` | Order earnings, adjustments, payouts |
| `/tailor/settings` | Shop information, staff and service area |

### Admin/operations
| Route | Purpose |
| --- | --- |
| `/admin` | KPI overview, blocked orders, logistics and backlog |
| `/admin/tailors` | KYC/verification and activation |
| `/admin/orders` | Queue, filters, assignment and timeline |
| `/admin/orders/[id]` | Approvals, exceptions, audit, all delivery tasks |
| `/admin/logistics` | Two-leg pickup/delivery board and proof of custody |
| `/admin/pricing` | Service catalog, charges, delivery zones, promotions |
| `/admin/disputes` | Claims, fitting correction, damage, compensation decisions |
| `/admin/finance` | Payment reconciliation, refund approval, payout ledger |
| `/admin/analytics` | Conversion, contribution, SLA, claim rates |

### UX principles
Use Hindi- and English-friendly copy, prominent prices, obvious progress markers, photo-first instruction forms, mobile-first tailor screens and persistent order IDs. Never display a delivery completion message based on garment stitching alone.

## 6. Order and fulfillment state machines

Main order status is a top-level projection of controlled domain events, distinct from payment, logistics-leg and correction statuses.

Primary workflow:
`DRAFT -> QUOTE_REQUESTED -> QUOTE_PENDING -> QUOTE_READY -> QUOTE_ACCEPTED -> PAYMENT_PENDING -> PAID -> PICKUP_SCHEDULED -> INBOUND_TRANSIT -> MATERIAL_RECEIVED -> IN_PRODUCTION -> QUALITY_CHECK -> RETURN_PICKUP_SCHEDULED -> OUTBOUND_TRANSIT -> DELIVERED -> COMPLETED`

Alternative terminal/exception paths:
- From any appropriate pre-production state: `CANCELLED` (refund rules depend on stage).
- `QUOTE_EXPIRED`, `TAILOR_DECLINED`, `PAYMENT_FAILED` are retry/terminal branches defined by request stage.
- `MATERIAL_ISSUE` pauses production until customer accepts resolution.
- `AMENDMENT_PENDING` pauses work if prices or scope change.
- `REWORK_REQUESTED -> REWORK_APPROVED -> REWORK_IN_PROGRESS -> RETURN_PICKUP_SCHEDULED` may occur after delivery.
- `DISPUTED` pauses any pending payout until resolution.

Payment statuses: `NOT_INITIATED`, `PENDING`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, `FAILED`. Payment attempts and webhook events are separate records.

Logistics leg statuses: `UNASSIGNED`, `ASSIGNED`, `PICKUP_SCHEDULED`, `PICKED_UP`, `IN_TRANSIT`, `DELIVERED`, `FAILED_ATTEMPT`, `CANCELLED`. Always create exactly two canonical legs per normal order: INBOUND (customer to tailor) and OUTBOUND (tailor to customer). Rework creates additional legs.

Production statuses (order-item level): `NOT_STARTED`, `IN_PROGRESS`, `READY_FOR_QC`, `APPROVED`, `REWORK_REQUIRED`.

State changes must use an authenticated transition service with guards, persisted event history, and optimistic concurrency or database transactions; never allow arbitrary string status updates from clients.

## 7. Proposed PostgreSQL data model

Use UUID primary keys, `created_at`, `updated_at`, explicit time zones and soft delete only where appropriate. Monetary amounts are signed BIGINT minor units (`amount_paise`) with currency `INR`, never float. `order_id` human-friendly code is separate from UUID. Foreign keys, indexes, unique constraints and tenant ownership are mandatory.

### Identity and access
- `users`: id, phone_e164 UNIQUE, email UNIQUE nullable, display_name, status, joined_at.
- `user_roles`: user_id, role ENUM(customer,tailor_owner,tailor_staff,courier,admin,finance), tailor_id nullable; UNIQUE(user_id,role,tailor_id).
- `customer_addresses`: id, user_id, name, phone, line1, line2, locality, landmark, city, state, pincode, latitude, longitude, is_default.
- `sessions` or verified external auth mapping; store refresh-token hash when managing own sessions.
- `consent_records`: id, user_id, purpose, policy_version, granted_at, withdrawn_at.

### Marketplace, location, and catalog
- `tailors`: id, owner_user_id, shop_name, slug UNIQUE, description, status, address_id, verified_at, rating_summary, max_open_orders, expected_turnaround_days.
- `tailor_staff`: tailor_id, user_id, permissions, status.
- `tailor_service_zones`: tailor_id, pincode, coverage_radius_km, active.
- `tailor_documents`: tailor_id, document_type, file_id, verification_status.
- `tailor_portfolio`: id, tailor_id, file_id, category_id, caption, approved, display_order, customer_permission_confirmed.
- `service_categories`: id, code, title, service_type, active, measurement_schema_version, customization_schema_json.
- `tailor_services`: tailor_id, category_id, price_mode, base_price_paise, min_days, max_days, active, capacity_per_week.
- `service_addons`: id, category_id, code, display_name, price_mode, default_price_paise.
- `service_zones`: id, pincode or polygon, pickup_fee_paise, return_fee_paise, operating_hours, active.

### Measurement, design, and media
- `measurement_profiles`: id, customer_id, label, for_person, body_type_label OPTIONAL, capture_method, is_active, created_at.
- `measurement_versions`: id, profile_id, version_no, schema_version, measurements_json, unit, measured_at, notes, UNIQUE(profile_id,version_no).
- `uploaded_files`: id, owner_user_id, storage_key, mime_type, size_bytes, sha256, purpose, scan_status, created_at.
- `garment_designs`: id, customer_id, category_id, customization_json, instruction_text, reference_file_ids.

### Booking, quotes, production
- `orders`: id, order_number UNIQUE, customer_id, tailor_id, pickup_address_id, return_address_id, service_zone_id, service_type, status, payment_status, customer_accepted_quote_id, expected_finish_at, version_int, created_at, updated_at.
- `order_items`: id, order_id, category_id, quantity, design_snapshot_json, alteration_instructions_json, material_details_json, measurement_version_id nullable, measurement_snapshot_json, base_price_paise, production_status.
- `order_item_addons`: id, order_item_id, addon_id, qty, final_price_paise.
- `order_item_files`: order_item_id, file_id, purpose (BEFORE, DESIGN_REFERENCE, MATERIAL, AFTER, QUALITY).
- `quotes`: id, order_id, revision_no, tailor_id, status, subtotal_paise, logistics_paise, tax_paise, discount_paise, total_paise, notes, valid_until, created_at; UNIQUE(order_id, revision_no).
- `quote_lines`: id, quote_id, order_item_id, description, quantity, unit_price_paise, total_paise, tax_metadata_json.
- `order_amendments`: id, order_id, quote_revision_id nullable, change_type, requested_by, status, details_json, customer_approved_at.
- `production_events`: id, order_item_id, actor_user_id, event_type, notes, file_id nullable, created_at.
- `order_status_events`: id, order_id, from_status, to_status, actor_user_id, actor_role, reason_code, metadata_json, occurred_at.

### Logistics and custody
- `logistics_jobs`: id, order_id, direction (INBOUND, OUTBOUND, REWORK_INBOUND, REWORK_OUTBOUND), origin_type, destination_type, status, scheduled_start_at, scheduled_end_at, assigned_courier_id nullable, package_id, seal_id, attempt_count.
- `logistics_handoffs`: id, logistics_job_id, handoff_type, from_party, to_party, item_count, otp_verified_at nullable, proof_file_id nullable, location_json, condition_notes, happened_at.
- `logistics_attempts`: id, logistics_job_id, attempted_at, result, reason_code, evidence_file_id nullable, next_attempt_at.
- `package_items`: package_id, order_item_id, item_count, material_length_cm nullable, condition_notes.

### Payments, accounting, dispute
- `payment_orders`: id, order_id, provider, provider_order_id UNIQUE, amount_paise, currency, status, idempotency_key UNIQUE, created_at.
- `payment_transactions`: id, payment_order_id, provider_payment_id UNIQUE nullable, kind, amount_paise, status, created_at.
- `webhook_events`: provider, provider_event_id, event_type, payload_hash, received_at, processed_at, processing_status; UNIQUE(provider,provider_event_id).
- `refunds`: id, order_id, payment_transaction_id, requested_amount_paise, approved_amount_paise, reason, status, provider_refund_id UNIQUE nullable, approved_by.
- `payout_accounts`: id, tailor_id, provider_reference, verification_status, last4, beneficiary_name; avoid plaintext sensitive bank storage.
- `tailor_payouts`: id, tailor_id, order_id, gross_service_paise, platform_commission_paise, adjustments_paise, tax_withholding_paise, net_payout_paise, status, paid_at, provider_reference; UNIQUE(order_id,tailor_id,payout_type) if needed.
- `ledger_entries`: id, order_id, event_id UNIQUE, account_code, entry_type (DEBIT,CREDIT), amount_paise, created_at; enforce balanced posting in application tests.
- `disputes`: id, order_id, category, reported_by, status, opened_at, resolution_type, resolved_at, resolved_by.
- `dispute_evidence`: dispute_id, file_id, submitted_by, note.
- `reviews`: id, order_id UNIQUE, customer_id, tailor_id, score, text, status, created_at.
- `notifications`: id, user_id, template_key, channel, payload_json, status, provider_message_id, retry_count.
- `audit_logs`: id, actor_id, actor_role, action, resource_type, resource_id, prior_json, next_json, ip, created_at.

### Relationship summary
`users 1:N customer_addresses/measurement_profiles/orders`; `tailors 1:N tailor_services/orders`; `orders 1:N order_items/quotes/logistics_jobs/order_status_events`; `measurement_profiles 1:N measurement_versions`; `orders 1:N payment_orders`; `orders 1:N disputes`; `orders 1:N tailor_payouts`; `order_items N:1 measurement_versions` with snapshot preserved.

### Indices and invariants
Index `orders(customer_id,created_at DESC)`, `orders(tailor_id,status,created_at DESC)`, `tailor_service_zones(pincode,active)`, `logistics_jobs(status,scheduled_start_at)`, `webhook_events(provider,provider_event_id)` UNIQUE, `quotes(order_id,revision_no)` UNIQUE, `order_status_events(order_id,occurred_at)`. Use a uniqueness constraint preventing duplicate active payout disbursement. Do not cascade-delete money or custody records. Restrict all tenant queries by tailor ID from authenticated session, not client request body.

## 8. Proposed REST API v1

Base prefix `/api/v1`. JSON; auth cookie or bearer strategy must be consistent. Use `Idempotency-Key` on mutating payment/order creation commands; provider webhooks are signature-verified and receive raw request bytes. Validate inputs with Zod or class-validator with typed generated contracts.

### Customer and identity
- `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/logout`, `GET /me`.
- `GET /service-zones/check?pincode=110086`, `GET /services`, `GET /tailors?category_id=&pincode=&page=`, `GET /tailors/:slug`.
- `GET /me/addresses`, `POST /me/addresses`, `PATCH /me/addresses/:id`, `DELETE /me/addresses/:id`.
- `GET /me/measurements`, `POST /me/measurements`, `POST /me/measurements/:id/versions`, `GET /me/measurements/:id/versions`.
- `POST /uploads/presign`, `POST /uploads/complete` (verify upload and ownership).
- `POST /orders` create draft with one tailor, `POST /orders/:id/items`, `PATCH /orders/:id/items/:itemId`, `POST /orders/:id/request-quote`.
- `GET /orders`, `GET /orders/:id`, `GET /orders/:id/quotes`, `POST /orders/:id/quotes/:quoteId/accept`.
- `POST /orders/:id/checkout` create provider payment order, `POST /orders/:id/pickup-slots` pick slot after confirmed payment, `POST /orders/:id/cancel`.
- `POST /orders/:id/confirm-delivery`, `POST /orders/:id/correction-requests`, `POST /orders/:id/reviews`, `GET /orders/:id/timeline`.

### Tailor
- `POST /tailor/onboarding`, `GET /tailor/me`, `PATCH /tailor/me`, `POST /tailor/portfolio`.
- `GET /tailor/requests`, `POST /tailor/requests/:orderId/accept`, `POST /tailor/requests/:orderId/decline`.
- `POST /tailor/orders/:id/quotes`, `POST /tailor/orders/:id/receipt`, `POST /tailor/orders/:id/progress`, `POST /tailor/orders/:id/amendments`, `POST /tailor/orders/:id/ready-for-qc`.
- `GET /tailor/orders`, `GET /tailor/orders/:id`, `GET /tailor/earnings`, `PUT /tailor/services/:serviceId`.

### Admin and logistics
- `GET /admin/orders`, `GET /admin/tailors`, `POST /admin/tailors/:id/approve`, `POST /admin/tailors/:id/suspend`.
- `GET /admin/logistics/jobs`, `POST /admin/logistics/jobs/:id/assign`, `POST /admin/logistics/jobs/:id/handoffs`, `POST /admin/logistics/jobs/:id/fail-attempt`.
- `POST /admin/orders/:id/resolve-material-issue`, `POST /admin/orders/:id/approve-qc`, `POST /admin/disputes/:id/resolve`.
- `POST /admin/refunds/:id/approve`, `POST /admin/payouts/:id/approve`, `GET /admin/finance/reconciliation`, `GET /admin/audit-logs`.
- `POST /webhooks/razorpay`, `POST /webhooks/whatsapp` (provider-authenticated; no customer session).

### Example create order request
```json
{
  "tailorId": "uuid-tailor",
  "serviceType": "CUSTOM_STITCHING",
  "pickupAddressId": "uuid-address",
  "returnAddressId": "uuid-address",
  "items": [
    {
      "categoryId": "uuid-category",
      "quantity": 1,
      "design": {"neckline": "round", "sleeves": "full", "fit": "regular"},
      "material": {"fabricType": "cotton", "suppliedBy": "CUSTOMER"},
      "measurementVersionId": "uuid-measurement-version",
      "referenceFileIds": ["uuid-image"]
    }
  ]
}
```

### Example event
```json
{
  "eventId": "uuid-event",
  "type": "order.material_received.v1",
  "aggregateId": "uuid-order",
  "occurredAt": "2026-11-06T12:00:00Z",
  "payload": {"orderId": "uuid-order", "logisticsJobId": "uuid-job"}
}
```

## 9. Core business rules and edge-case decisions

| Area | Rule / acceptance behavior |
| --- | --- |
| Serviceability | No quote/checkout when pickup address or selected tailor is outside active zone. |
| Quote | Customer must accept the latest unexpired quote; earlier versions cannot be paid. |
| Pricing | Immutable quote snapshot; any post-receipt change requires written amendment approval. |
| Payments | Capture only server-verified provider success; duplicate webhooks cannot double-create transitions. |
| Inventory | Do not assume platform owns fabric or garments; record customer's ownership and custody transfers. |
| Intake | Count pieces at pickup and at tailor receipt; discrepancy pauses fulfillment. |
| Measurement | Snapshot exact measurement version and declared capture method per item at quote acceptance. |
| Production | Cannot start without required materials and accepted quote/payment state. |
| Logistics | Outbound return must not start until quality gate and packaged handoff are complete. |
| Cancellation | Stage-specific cancellation policy shown before payment; document pickup costs and refunds. |
| Quality | Customer claims use bounded claim window and review; do not auto-approve all claims. |
| Lost material | Preserve before/after photos and declared value, escalate to admin, apply written compensation limits and applicable law. |
| Tailor capacity | Stop accepting new requests if verified capacity or absence window is exceeded. |
| Payout | One verified payout per approved payable balance; exclude disputed or refundable amounts. |
| Privacy | Restrict raw measurements/photos, use short-lived signed links and meaningful retention periods. |
| Reviews | Only paid, delivered orders may submit one review; moderation for abuse. |
| Performance | Order creation, quotation and payment transitions are idempotent and transaction-safe. |

Suggested launch policies (to be reviewed with business/legal team): tailor reply within 12 business hours, quote valid 48 hours, pickup slots on next business day where available, basic fitting-issue report within 48 hours after delivery, maximum one eligible correction; no blanket fit warranty for customer-entered measurements. Delays and eligibility are configurable by zone/category and must be shown at checkout.

## 10. Checkout, commissions and payout policy

Proposed amount decomposition:
- `tailoring_subtotal`: sum of final approved stitching/alteration quotes and add-ons.
- `platform_commission`: tailoring_subtotal * commission rate, recorded as payable from tailor under contract; not necessarily an extra customer line.
- `logistics_fee`: customer-facing explicit charge, covering inbound+outbound legs.
- `discounts`: funded by either platform or tailor; funding source must be recorded.
- `taxes`: calculated by applicable legal tax configuration and invoicing entity; do not hard-code one blanket GST rate.
- `customer_payable`: item totals + logistics + applicable tax - eligible discounts.
- `tailor_payable`: approved supplier amount minus platform fee and any agreed adjustments, plus/minus applicable taxes/withholdings.

Example (not a tariff): tailoring INR 1,500; 15% commission INR 225; customer delivery fee INR 149; platform revenue before costs INR 374; courier for two legs INR 140; payment fee allowance INR 35; packaging/support INR 40; contribution INR 159 before overhead, taxes, rework and acquisition. Poor unit economics for one low-cost alteration; enable bundled garment orders and minimum baskets.

Provider reality check as of November 2026: Razorpay Route split payouts require account eligibility, including published turnover and transparency conditions. Do not assume a new marketplace is automatically eligible. Design a provider-agnostic payout interface. MVP may collect payment into an approved merchant account then pay tailors manually or with an approved payout provider, subject to contract, tax and compliance review. Do not label the platform an 'escrow' service unless a properly approved escrow arrangement exists.

## 11. Recommended stack, monorepo and architecture

Use a TypeScript-only MVP for implementation speed and consistent contracts. A Go service can be added after scale or genuine performance requirements; avoid premature microservices.

- Web: Next.js App Router, TypeScript, Tailwind CSS, accessible components (shadcn/ui or equivalent), React Hook Form + Zod, TanStack Query for server state.
- API: NestJS (TypeScript) modular monolith; REST + OpenAPI; request DTO validation; role+tenant guards; domain services.
- Database: PostgreSQL 16+, Prisma migrations/ORM (or Drizzle, choose exactly one).
- Jobs: Redis + BullMQ for notifications, reconciliation and retryable provider calls; PostgreSQL is source of truth.
- Storage: S3-compatible bucket for reference/condition photos; private storage, signed access and virus scanning.
- Payments: Razorpay hosted checkout with raw-body verified webhooks; payout abstraction, manual payouts first if necessary.
- Notifications: SMS OTP provider, email, optional WhatsApp Business API compliant templates; begin with email/SMS if WhatsApp approval is incomplete.
- Observability: structured logs, correlation IDs, Sentry or equivalent error reporting, job dashboards, basic metrics.
- Hosting: web on Next-compatible platform; API and jobs on managed container hosts; managed PostgreSQL and Redis. Staging and production have separate credentials, buckets and payment keys.

```text
Customer / Tailor / Admin Browser
                 |
            Next.js Web
                 |
          HTTPS REST API
                 |
          NestJS API Server
     +-----------+------------+
     |           |            |
 Postgres      Redis       S3-compatible
 (truth)      BullMQ         storage
     |           |            |
     +---- Outbox / Job Workers
                 |
        Payment / SMS / Email / WhatsApp
                 |
          Provider webhooks
                 |
         Verified API ingress
```

### Suggested repository
```text
stitchmate/
  AGENTS.md
  README.md
  pnpm-workspace.yaml
  package.json
  .env.example
  docker-compose.yml
  apps/
    web/
      src/app/(public)/
      src/app/(customer)/
      src/app/(tailor)/
      src/app/(admin)/
      src/components/
      src/features/
      src/lib/
    api/
      src/main.ts
      src/modules/
        auth/
        users/
        marketplace/
        catalog/
        measurements/
        media/
        quotes/
        orders/
        logistics/
        payments/
        payouts/
        disputes/
        notifications/
        audit/
      prisma/
      test/
    worker/
      src/
  packages/
    contracts/
      src/schemas/
      src/types/
    ui/
    config/
  docs/
    architecture.md
    state-machines.md
    api-contract.md
    policy-decisions.md
    pilot-scorecard.md
```

Keep `apps/api` as the single transactional owner of orders, payments and custody history. Worker jobs call safe commands or process an outbox; they do not directly mutate business state through duplicated ad-hoc SQL.

## 12. Security and reliability baseline

- Phone verification with OTP rate limits, expiry and anti-abuse controls.
- RBAC plus object-level and tailor-tenant ownership checks for every request.
- Auth cookies: Secure, HttpOnly, SameSite; CSRF protection where relevant; session rotation on role changes.
- Password/secrets only in managed secret store or environment; never committed; provider API keys server-side only.
- Upload allowlist (JPEG/PNG/WEBP/PDF if needed), max size, malware scan, metadata removal, private object keys, signed URL expiry.
- Encrypt data at rest and in transit. Treat measurements as intimate personal details; use explicit purpose/retention controls.
- Webhook raw-body signature verification, unique provider event ID, durable inbox, retries with safe dedupe.
- Retry/outbox for notification and finance jobs; no blind retry of payout creation without provider idempotency support.
- Database transactions or optimistic version checks prevent simultaneous quote acceptance and cancellation from inconsistent states.
- Critical endpoints use deterministic idempotency keys; prevent double pay and double payout.
- Accessible UX, audit trails for admin overrides, structured redaction in logs, DB backups and restore test.

## 13. Operational and regulatory considerations

- For customer fabric custody: have written terms defining ownership, responsibility, approved modifications, claims process, declared value and reasonable compensation policy.
- For finance: obtain GST/accounting advice on whether StitchMate is acting as an e-commerce operator, principal or agent and on relevant GST registration, e-commerce TCS, tax invoices and payout mechanics. Do not code assumptions about tax status into constants.
- For privacy: India notified DPDP Rules in 2025 with phased commencement; use minimization, transparency, consent records, purpose-bound access, secure media, deletion/retention controls and a process for handling user requests. Obtain qualified legal advice before public launch.
- For WhatsApp: use an approved opt-in and approved template messages for business-initiated status updates; add fallback SMS/email.
- For logistics: train partners in photo/OTP proof, package seals, handling fragile/valuable garments and re-attempt policies.

Official references to check during integration:
- https://tfs.np.razorpay.in/docs/payments/route/faqs
- https://cbic-gst.gov.in/hindi/sectoral-faq.html
- https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa

## 14. Product analytics and business validation

Funnel events: location_verified, service_selected, item_configured, tailor_viewed, quote_requested, quote_received, quote_accepted, checkout_started, payment_confirmed, pickup_completed, material_received, production_started, QC_passed, delivered, review_submitted, fitting_claim_opened.

Weekly pilot scorecard:
- Qualified visitors and quote requests; quote acceptance rate and median time-to-quote.
- Percentage of requests accepted by tailors; production and end-to-end on-time rates.
- Pickup completion at first attempt and average two-leg courier cost.
- First-time fit success; rework, damage/loss and refund rates.
- Average order value, platform take rate, payment costs and contribution after logistics.
- Customer support incidents per 100 orders; repeat purchase and tailor retention.

Do not buy paid traffic aggressively until order completion, quality and contribution metrics are stable.

## 15. Delivery plan: six engineering phases

### Phase 0: Repo, contracts, basic UX
Set up pnpm workspace, Next.js, NestJS, TypeScript strict mode, lint/format/test commands, Docker Compose PostgreSQL/Redis, environment example, shared Zod contracts, route layouts, seed categories and Tailor/Customer/Admin demo accounts. Architecture decision record and CI checks.

Done when: `pnpm install`, `docker compose up -d`, `pnpm build`, `pnpm lint`, `pnpm test` run with documented setup; app renders on mobile and desktop.

### Phase 1: Identity, marketplace and onboarding
OTP auth with provider abstraction and local development mock, RBAC, service zones, catalog, tailor profiles, portfolio upload, admin approve/suspend, discovery and service filtering.

Done when: only approved tailors show up; users cannot view other users' data; routes are role-protected; API contract tests pass.

### Phase 2: Bookings, measurements, quotes
Measurement profiles/versions, file uploads, order draft/items, stitching and alteration customizers, tailor quote review and revision, customer quote acceptance, optimistic transitions, timeline.

Done when: both service types complete an unpaid quote flow; accepted quote snapshot cannot change; tests cover concurrency and invalid states.

### Phase 3: Payments and logistics
Razorpay sandbox checkout with verified webhooks, payment idempotency, shipping fee quote, pickup slot selection, two leg logistics job creation, manual dispatch and proof of handoff.

Done when: a paid booking can be collected, handed to tailor, returned and delivered without editing the DB manually. Duplicate webhooks do not duplicate orders or payments.

### Phase 4: Production, corrections and finance
Tailor production milestones, condition exceptions and approvals, amendments, photos, QC, claim/rework workflow, configurable cancellation/refund, finance reconciliation and manual payout approval.

Done when: material discrepancy, customer-approved price increase, failed pickup, duplicate webhook, return delivery failure and one correction cycle all have automated integration tests.

### Phase 5: Pilot hardening and launch
Accessibility, full journey E2E tests, webhook replay, backups/restore, rate limiting, ops dashboards, notification templates, privacy/terms pages, documentation, QA with pilot partners.

Done when: production smoke tests, failure-mode runbooks, support SOP, legal/payment-provider review, staging/prod separation and a controlled launch checklist are complete.

## 16. Test scenarios Codex must implement

1. Customer in unserviceable zone is stopped before quote request.
2. Customer cannot modify another customer's measurements or orders.
3. Unapproved tailor cannot accept paid orders.
4. Quote V1 is rejected for payment after quote V2 is created.
5. Expired quote cannot be accepted.
6. Payment webhook replay is idempotent and does not double-increment ledger entries.
7. Fake payment success returned by browser does not mark order paid.
8. Material handoff mismatch creates an exception and pauses production.
9. Courier has access only to assigned job's minimum PII.
10. Tailor cannot change accepted price without customer-approved amendment.
11. Admin cannot release payout twice in a race.
12. Cancellation after pickup follows correct policy and does not silently lose fabric.
13. Tailor cannot begin production until required measurement/sample/fabric conditions are satisfied.
14. QC failure blocks outbound dispatch.
15. Failed return delivery remains open and can be rescheduled.
16. Correction request inside configurable window creates a supervised workflow.
17. Screenshot/photo endpoints do not return public bucket URLs or leak customer photos.
18. Multiple item bundle gets one inbound and one outbound logistics job.
19. Worker retry on a notification doesn't duplicate payment or payout.
20. Entire key customer journey works from mobile browser.

## 17. Deferred features (post-MVP)

Native Android/iOS apps, automated courier partner integrations, AI-generated style mockups, automatic body measurements from photos, multi-tailor carts, tailors selling fabric, real-time driver tracking, loyalty subscriptions, multilingual voice support, dynamic route optimization, live chat with automatic sharing of personal phone numbers, and self-service tailor payout splits (until approved and commercially justified).

## 18. Go/no-go gate for real orders

Before accepting customer money or fabric: approved payment onboarding, written refund and custody policies, tailor contracts, clearly displayed logistics pricing, verified tailors, support contact, reliable bag identification, proof-of-handover process, incident procedure, insurer/legal assessment where appropriate, test-mode-to-live payment checklist, tax registration/compliance review, verified backup/restore, and a human handling exceptions during operating hours.

## 19. Critical questions to validate during pilot

- Which 2-3 categories create the strongest demand and least fitting corrections?
- What fraction of customers have reusable measurements or a sample garment?
- How much does two-leg delivery actually cost by zone and basket size?
- Do tailors accept a 15% fee after their material risk, labor and capacity costs?
- What is the median fabric-to-delivery cycle time?
- Can the business afford one no-cost eligible fitting correction?
- Is a fixed catalog price viable, or is every job a quote?
- Which tax/invoicing entity is the supplier in each transaction?
- Which local neighborhoods have sufficient tailor density to promise realistic collection and delivery slots?
