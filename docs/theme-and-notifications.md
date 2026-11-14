# StitchMate: adaptive theme, Ant Design and personal notifications

## Compatibility and scope
- Existing stack: Next.js 15 (App Router), React 19, NestJS 10, Prisma 6, PostgreSQL, Render free-tier.
- UI library: Ant Design 6.7, @ant-design/nextjs-registry 1.3; React 19 is supported. Ant Design is selectively integrated; existing brand styling remains the primary visual system.
- No changes to original order state machine, payment provider interfaces, OTP login, approvals, or delivery custody rules.
- No new paid service, broker, worker, or hosted database. The notification inbox uses the existing PostgreSQL instance.

## Design system
- \`StitchThemeProvider\` supplies Ant Design \`ConfigProvider\` tokens for StitchMate green, spacing, radius and control sizes.
- \`data-theme=light|dark\` semantic CSS variables style the original custom pages as well as new interactive elements. The preference is \`light\`, \`dark\`, or \`system\`.
- An inline pre-hydration bootstrap script reads \`stitchmate:theme\` from localStorage and detects \`prefers-color-scheme\`. This prevents a light-colored first paint before React hydration. The provider waits for the browser preference to load before updating the document.
- Appearance controls are in the desktop header and mobile drawer. Selected preference persists per browser; system changes are listened to while the tab stays open.
- Native forms retain existing validation and event handlers where changing component APIs would risk changing business logic. Ant Design is used for the OTP form, address inputs, measurement number fields, searchable tailor service selects, date/time pickup picker, modal confirmations, and user notifications.

## Notification model and privacy
- \`Notification\`: UUID, recipient \`userId\`, required \`role\`, dedupe \`sourceKey\`, type, title/body, safe relative href, timestamp, readAt.
- Unique \`(userId,sourceKey,role)\` prevents duplicate notification delivery for the same source event.
- \`NotificationPreference\`: \`userId\` primary key, \`soundEnabled=false\` by default. Preference is per account (rather than per tab).
- Requests are authenticated via the existing signed-in HTTP-only session cookie using \`AuthService.require\`. Every list/count/read mutation filters by the current recipient ID and authorized role. Foreign IDs cannot update another person's notification. Admin-only alerts require the admin role; finance receives finance-specific alerts only.
- The API does not accept public create-notification calls. All messages come from persisted domain records.

## Event sources
The notification projector observes existing PostgreSQL rows without modifying payment/booking/parcel writes.

| Audience | Sources and examples |
| --- | --- |
| Customer | \`OrderStatusEvent\` (request accepted, payment, material receipt, stitching, QC, delivery, claims), \`Quote\`, \`Refund\`, \`LogisticsHandoff\` |
| Tailor | \`OrderStatusEvent\`, \`Review\`, \`TailorPayout\`, assigned \`LogisticsJob\` |
| Delivery partner | Approved \`DeliveryPartner\` + unassigned service-zone \`LogisticsJob\`, assigned jobs, verified \`LogisticsHandoff\` |
| Admin | Pending \`Tailor\`, \`DeliveryPartner\` applications, \`Dispute\`, failed \`LogisticsJob\`, \`AuditLog\` and manual-intervention \`OrderStatusEvent\` |
| Finance | Refund-related audit records and payment-failure events; never unapproved admin-workspace actions |

New notifications are inserted with \`createMany({skipDuplicates:true})\`. Each authenticated notification refresh projects a bounded slice of the last 30 days and uses a 12-second per-user throttle. Unlike frontend-inferred events, projections survive restarts. The bounded scan intentionally does not backfill unlimited historical events.

## API
All routes below are prefixed with \`/api/v1\` and require the existing session cookie.

| Method | Path | Function |
| --- | --- | --- |
| GET | \`/notifications?limit=20&cursor=...\` | Paginated personal inbox and unread count |
| GET | \`/notifications/state\` | Latest event ID and unread count |
| GET (SSE) | \`/notifications/stream\` | Lightweight authenticated streaming state every ~25s |
| PATCH | \`/notifications/:id/read\` | Mark only an owned/authorized notification as read |
| PATCH | \`/notifications/read-all\` | Mark all authorized personal notifications as read |
| GET | \`/notifications/preferences\` | Read account sound preference |
| PATCH | \`/notifications/preferences\` | \`{"soundEnabled":true|false}\` |

The browser uses EventSource with credentials; on disruption it reconnects automatically, with a visibility-aware 45-second REST fallback. The API revalidates the session on each SSE cycle. State streaming sends IDs/counts, not another user's message contents.

## Sound
- Muted until the user explicitly opts in; preference persists in PostgreSQL.
- A short original, low-volume two-tone Web Audio API chime is generated only after allowed browser user activation and while the tab is visible.
- Initial inbox hydration, previously read notifications and duplicates never produce a chime.
- Browser policies can still block playback; no order or notification functionality depends on audio.

## Validation and rollback
1. \`pnpm install --frozen-lockfile\`; \`pnpm db:generate\`; \`pnpm typecheck\`; \`pnpm build\`; \`pnpm test\`.
2. On temporary CI PostgreSQL: \`pnpm --filter @stitchmate/api prisma:deploy\` and the existing gig+delivery E2E followed by \`test/notifications.e2e.mjs\`.
3. Chromium visual smoke: 320, 375, 390, 768, 1024, 1440px; navigation/overflow/SSR theme/persistence and authenticated bell; capture light/dark screenshots.
4. Review the draft PR and staging/backup plan before a database migration or live deployment.
5. Rollback uses the previous Render frontend/backend releases; the new notification tables can remain in place since they are additive and do not affect original business tables.

## Known limitations
- Render free-tier single-instance polling/SSE is near-real-time (~25s), not a sub-second push channel. No background always-on worker or cross-instance fanout is introduced.
- A lost SSE connection falls back to periodic reads; long-offline clients catch up on their next authenticated refresh.
- System/theme preference persists per browser, not centrally per account. Sound preference persists per account.
- No push notifications, background mobile push, SMS, or WhatsApp notification delivery is added.
- Newly available courier alerts point to the live job board; a job may be claimed by someone else before a recipient opens it.
- Native file upload controls remain attached to the existing presigned S3 flow; replacing them wholesale with Ant Design Upload would risk altering upload semantics.
- Existing business rows are the source of truth. Notification projector is bounded to recent data; older notification records remain visible in the inbox when paginating.
- Production deployment is intentionally not triggered by this branch; the new migration must not be applied to the existing database until approved.
