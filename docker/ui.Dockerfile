# Master Data UI with the custom overlay (ui/overrides/) on top:
# Upstream's own build (master-data-ui), from the pinned branch/commit of
# https://github.com/OpenG2P/master-data-service.git.
#
# Build from the mds directory:
#   docker build -f docker/ui.Dockerfile -t coss-mds-ui:local .
# Or from the repository root:
#   docker build -f mds/docker/ui.Dockerfile -t coss-mds-ui:local mds
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS source
ARG BASE_IMAGE_VERSION=develop
RUN apk add --no-cache git \
 && git init -q /src && cd /src \
 && git remote add origin https://github.com/OpenG2P/master-data-service.git \
 && git fetch -q --depth 1 --filter=blob:none origin "$BASE_IMAGE_VERSION" \
 && git sparse-checkout set master-data-ui \
 && git checkout -q FETCH_HEAD

FROM base AS builder
COPY --from=source /src/master-data-ui/package.json /src/master-data-ui/package-lock.json ./
RUN npm ci --no-audit --no-fund --loglevel=error
COPY --from=source /src/master-data-ui/ ./
COPY ui/overrides/ ./
RUN rm -f .gitkeep
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
