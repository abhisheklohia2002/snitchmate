FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
COPY . .
# Supply NEXT_PUBLIC_API_URL=/api/v1 for same-origin HTTPS reverse proxy.
ARG NEXT_PUBLIC_API_URL=/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @stitchmate/api prisma:generate
RUN pnpm build
# One image for three service commands. Optimize layers / dependency pruning later.
FROM build AS runtime
ENV NODE_ENV=production
WORKDIR /app
EXPOSE 3000 4000
CMD ["pnpm", "--filter", "@stitchmate/api", "start"]
