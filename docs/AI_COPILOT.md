# StitchMate AI Copilot — implementation and production runbook

## Existing architecture (reused)
- Next.js 15 App Router + React 19, Ant Design 6, StitchMate CSS variables / Light-Dark-System themes.
- NestJS 10 application and HTTP-only cookie sessions (\`AuthService.require\`) with CSRF Origin protection.
- PostgreSQL / Prisma 6, approved Tailor + TailorService + TailorZone, published Gig + GigPackage, Category catalog, and order/quote/payment/delivery tables.
- Existing S3-compatible \`POST /uploads/presign\` + \`POST /uploads/:id/complete\` and verified private images.
- Existing \`/book/[tailorId]\` frontend and \`POST /orders\` / \`POST /orders/:id/request-quote\`; AI does not call these endpoints itself.
- Notifications/SSE and all existing financial and courier business flows remain untouched.

## New architecture
\`apps/api/src/ai/\` has isolated NestJS module/controller/service, an OpenAI Responses API SDK provider, Zod requirement/brief schemas, restrictive assistant prompt, and deterministic matching service. No LangGraph or extra workers required.

Conversation data is restricted to the signed-in \`userId\` in *every* read and mutation. New additive Prisma models:
- \`AiConversation\`: owner, title, structured requirements, image IDs, confirmed brief, timestamps.
- \`AiMessage\`: messages + requestId; unique \`conversationId,role,requestId\` supports idempotency.
- \`AiDailyUsage\`: user/day atomic request count and token usage.

No changes to Order, Payment, Shipping, UserRole or existing marketplace contract.

## HTTP routes (existing /api/v1 prefix)
| Method | Route | Purpose |
| --- | --- | --- |
| GET | \`/ai/config\` | Feature availability, limits (auth required) |
| GET | \`/ai/conversations\` | Last 30 active owned conversations |
| POST | \`/ai/conversations\` | Start an owned conversation |
| GET | \`/ai/conversations/:id\` | Private history, images, requirements |
| POST | \`/ai/conversations/:id/messages\` | Validated chat with optional verified reference image IDs |
| POST | \`/ai/matches\` | Deterministic matching from real DB; no LLM invented prices |
| POST | \`/ai/conversations/:id/confirm\` | Explicit review of edited brief + current gig/package revalidation |
| GET | \`/ai/conversations/:id/booking\` | Confirmed brief prefill, owner-only, eligible gig recheck |

## Customer-to-quotation flow
1. Customer signs in → \`/ai-studio\` → starts conversation.
2. Adds up to three JPG/PNG/WebP references (max 5 MB each, validated before use) using existing S3 presign/complete flow.
3. NestJS loads the last eight messages and the prior Zod-validated requirements. The official \`openai\` SDK calls a vision-capable Responses model with \`store:false\` and strict JSON-schema output.
4. Server validates every model-generated field; trusted Prisma queries provide only approved, active tailor/gig/category/zone packages and live prices. Unknown categories honestly return no result.
5. Customer edits the brief, selects a real package, explicitly confirms.
6. Server checks ownership, reference IDs and the selected published gig again, then builds a link to the existing \`/book/:tailorId\` page.
7. The existing booking page fetches only the confirmed owner-scoped prefill and puts instructions, service category, reference-image IDs and package into its original form. Customer still provides address and measurements/fitting sample, submits the existing order API, then proceeds through original quote/payment/logistics rules.

## Required Render backend env vars
Set these in Render **existing backend service** Environment section, not the frontend:
\`\`\`
STITCHMATE_AI_ENABLED=true
OPENAI_API_KEY=<set-with-Render-secret-input-not-GitHub-or-chat>
OPENAI_COPILOT_MODEL=gpt-5-mini
AI_MAX_REQUESTS_PER_USER_PER_DAY=30
AI_MAX_IMAGE_BYTES=5242880
\`\`\`
A valid billing-enabled OpenAI API project key is required for live model responses. Missing key leaves the rest of StitchMate operational with AI disabled. Never use \`NEXT_PUBLIC_OPENAI_API_KEY\` and never commit or log a key.

The backend Render service and frontend continue using their **existing free instances** and PostgreSQL. OpenAI calls incur separate token/image charges; model usage is not free solely because hosting is free. Set appropriate API project spending caps.

## Security and performance controls
- Authenticated, user-scoped conversations; no cross-user reads; uploaded objects must be verified and user-owned.
- LLM never receives phone, addresses, payment identifiers, session secrets, other users' data or raw S3 credentials.
- Presigned image reads expire after 90 seconds. Only up to 3 owned verified images ≤5 MB are sent in an individual request.
- At most 30 live conversations/user, 50 user messages/conversation, last 8 messages sent to AI, last 60 history messages returned, 1,600-character messages.
- Atomic daily request counter (default 30/day, hard cap 100) plus 50,000 total token budget/day.
- No customer-facing payments, gig publishing, courier actions or order mutations are available as AI tools.
- One OpenAI request has 25-second timeout, at most one retry. Provider errors are sanitized.
- Idempotency key is claimed before quota/model invocation; concurrent repeats receive a conflict instead of double charging.
- Aged conversations (>30 days since last update) are removed on that account's next conversation creation. For stricter regulated retention, add an independently scheduled cleanup task.
- AI is opt-in by environment flag; existing business routes continue to operate without any AI configuration.
- Strict JSON schema output + Zod validation; user text/images are treated as untrusted evidence, not instructions.
- Prices/delivery estimates are sourced only from active published packages, not generated by the model. Package durations are indicative, not delivery guarantees.

## Tests and deployment gate
1. \`pnpm install --frozen-lockfile\`; \`pnpm --filter @stitchmate/api prisma:generate\`; \`pnpm typecheck && pnpm build && pnpm test\`.
2. Disposable PostgreSQL migration + original gig/parcel E2E and notification authorization E2E.
3. \`test/ai-copilot.e2e.mjs\` uses the fake OpenAI server on **localhost 127.0.0.1:4019 only when NODE_ENV=test**; verifies image ownership, private conversations, validation, real matching, booking prefill and quotas without real external API costs.
4. Chromium screenshots and UI interactions at 320/375/390/768/1024/1440 widths in both theme modes. QA artifacts are emitted by CI.
5. Only after every check passes: merge PR, synchronize existing backend Render branch, migrate/additive API deploy, verify API health, then deploy existing web service.
6. If the key is not configured: leave AI feature disabled and clearly identify the missing backend environment variable.

## Known limitations
- Some garment categories such as bridal lehenga are **not in the existing StitchMate service catalog**. Copilot will not invent them or offer a fabricated gig. Tailors and administrators must add real categories/gigs through normal approved processes.
- Prompt-guided visual style extraction is advisory, not a fit or material-composition guarantee.
- No AI-generated garment images or virtual try-on in this release.
- OpenAI vision has external API usage costs. Free-tier Render services may cold start.
- Booking still requires existing customer measurements (or fitting sample), address, tailoring quote approval, and payment.
