# StitchMate: post-payment fulfillment + verified nearby-tailor map

This is an **incremental upgrade** to the existing project. It deliberately does not replace auth, MSGKART's native HTTPS fix, Razorpay integrations, Twilio, or stored orders. It is an MVP implementation, not a production launch certification.

## Apply on your existing Ubuntu installation

1. Back up your current project and database. **Do not run `prisma migrate reset`, `db push --force-reset`, or delete Docker volumes.**
2. Extract the supplied upgrade ZIP and run its `apply_update.py` from the existing StitchMate project root. The installer backs up every replaced source file.
3. Install the new map dependency, generate the Prisma client, and apply the additive shop-coordinate migration:

```bash
cd ~/Downloads/StitchMate_Final_MSGKART_Twilio_Razorpay/stitchmate
pnpm install --no-frozen-lockfile
pnpm db:generate
pnpm --filter @stitchmate/api exec prisma migrate deploy
pnpm db:generate
pnpm typecheck && pnpm build && pnpm test
```

`prisma migrate deploy` applies the new migration without resetting existing records. If your database reports a missing initial migration or migration-history drift from switching project ZIPs, **stop and reconcile the original migration files**. Do not reset an in-use database. Preserve any previously restored migration folders in `apps/api/prisma/migrations`.

4. Run local infrastructure and services:

```bash
docker compose up -d
pnpm dev
# in a second terminal if you want notifications:
pnpm dev:worker
```

If Redis port `6379` is already occupied by another project, retain your existing port change and ensure `REDIS_URL` matches. This update does not alter Compose or `.env`.

## Test the complete primary order journey

Use separate browser sessions for customer, tailor and admin. Use **mock payment only for local test orders** and development-only OTP transport until a dedicated approved WhatsApp handoff template is ready.

1. Customer accepts the tailor quote and completes a verified sandbox or **dev-only simulated** checkout.
2. Customer opens `/orders/{id}` and schedules collection (at least 1 hour in the future).
3. Admin opens `/admin/logistics`. An **INBOUND** job should appear. Select an existing courier account and assign it. If no courier account exists, set `COURIER_BOOTSTRAP_PHONE` in the untracked `.env`, run `pnpm db:seed`, refresh. The role is assigned by the seed, not by the UI.
4. At **customer pickup**, admin issues the first handoff OTP, receives the actual code from the customer, enters **actual piece count**, seal ID, condition notes and uploads a **HANDOFF** photo. Confirm; order moves to `INBOUND_TRANSIT`.
5. At **tailor delivery**, confirm the second OTP/photo/count/seal. Order moves to `MATERIAL_RECEIVED`. No courier-to-tailor handoff can be skipped.
6. Tailor opens `/tailor/orders/{id}`, verifies the fabric and either reports a material issue (with photo) or starts stitching. Each completed garment requires a **QC** photo and `READY_FOR_QC` event.
7. Admin opens `/admin/orders`, selects **Review QC evidence** and checks each private photo at `/admin/orders/{id}/qc`. Only then approves QC. A new **OUTBOUND** return job is created.
8. Admin assigns a return courier. First verifies tailor-to-courier handoff with OTP/photo/count, then courier-to-customer handoff with another OTP/photo/count.
9. Customer opens `/orders/{id}`, sees `DELIVERED` and clicks **Confirm garment received**. The order reaches `COMPLETED`; existing review/correction flows remain available.

All transitions remain enforced server-side. Client-side button availability is not the authorization boundary. Never mark payments paid from the browser; rely on the verified Razorpay webhook or dev-only mock confirm.

## Nearby tailors on a map

- New `latitude`, `longitude`, and `locationVerifiedAt` columns on `Tailor` are **nullable**, so current shops/orders remain valid. No arbitrary map pin is inferred from a postal code.
- Admin visits `/admin/tailors`, approves the shop, **verifies the actual physical workshop location** and saves the GPS pin. The action is audited.
- Customers visit `/tailors`, type a serviceable pincode and see verified shops and their pins on a Leaflet/OpenStreetMap map.
- **Within 7 km of me** asks the browser for location permission. If granted, the API filters *approved, serviceable, location-verified* workshops and computes straight-line distances via Haversine. No distance or coordinates are invented for missing pins.
- Pincode-only mode continues to list approved serviceable tailors **even if no map coordinates have been entered yet**. The map explains why a card may not have a pin.
- The map requires internet for OpenStreetMap tiles. It uses Leaflet as a frontend dependency. For high-traffic production use, obtain a compliant tile provider and an appropriate geospatial index (e.g. PostGIS) rather than this pilot-sized 500-candidate search.

## Limitations and live launch gates

- The admin coordinates tool is a manual, verified shop-pin workflow, not Google Places geocoding or third-party GPS tracking. Customer location is optional and used on explicit request only. It is sent to your backend in a GET query; avoid logging/retaining that query and define a privacy policy before launch.
- Courier assignments are manual and recorded by admin on the courier's behalf, consistent with the pilot specification. There is no separate courier mobile app or live driver GPS route tracking.
- Handoff WhatsApp delivery needs an **approved, authorized HANDOFF OTP** template and verified provider receipt. A successful MSGKART HTTP send response alone does **not** prove customer delivery. In development, mock OTP is allowed with no real SMS/WhatsApp.
- Verify uploads to local MinIO or managed S3; evidence photos will fail unless storage and presigned upload URLs are reachable from the browser.
- Refunds, claims, payout bank disbursement, SLA automation, tax treatment, and operations contracts require additional live-system verification and human process. Do not use real funds/fabric in an unverified build.
- Full dependencies, Prisma deploy and browser end-to-end testing must be run on the user's machine; the packaging environment could only run syntax/source-level validation.
