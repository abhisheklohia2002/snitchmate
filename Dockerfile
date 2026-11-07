FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
COPY . .
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG NEXT_PUBLIC_OTP_CHANNEL=whatsapp
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_OTP_CHANNEL=${NEXT_PUBLIC_OTP_CHANNEL}
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @stitchmate/api prisma:generate
RUN pnpm build

FROM build AS runtime
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 3000 4000
CMD ["pnpm", "--filter", "@stitchmate/api", "start"]
