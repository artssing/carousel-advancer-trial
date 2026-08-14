# syntax=docker/dockerfile:1
# Admin portal (Next.js 14) — build context = REPO ROOT
#   docker build -f apps/admin/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000/api -t authentik-admin .
# ⚠️ NEXT_PUBLIC_* build-time inline → UAT/PROD 各自 build。
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /repo

FROM base AS deps
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/admin/package.json         apps/admin/package.json
COPY packages/domain/package.json   packages/domain/package.json
COPY packages/utils/package.json     packages/utils/package.json
COPY packages/ui/package.json        packages/ui/package.json
COPY packages/config/package.json    packages/config/package.json
COPY packages/api-client/package.json packages/api-client/package.json
# npm install（唔用 ci）：補返 alpine 平台嘅 Next SWC optional dep
RUN npm install --no-audit --no-fund

FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CONSUMER_URL
ARG NEXT_PUBLIC_AUTHENTICATOR_URL
ARG NEXT_PUBLIC_ADMIN_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_CONSUMER_URL=$NEXT_PUBLIC_CONSUMER_URL \
    NEXT_PUBLIC_AUTHENTICATOR_URL=$NEXT_PUBLIC_AUTHENTICATOR_URL \
    NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL
COPY packages ./packages
COPY apps/admin ./apps/admin
# Next 會試「patch」lockfile 攞返平台專屬嘅 SWC binary，而佢揀 package manager
# 嗰下會揀中 node:20-alpine 自帶嘅 yarn 1.22，然後死喺 `packageManager: npm@…`
# 上面（"defines packageManager yarn@npm@11.12.1"）。node_modules 上面個
# `npm install` 已經裝好，所以 build 唔需要 lockfile —— 攞走佢，patch 就唔會行。
# 呢個 bug 一直存在，只係之前次次都食 build cache 冇行到（2026-08-12 清 cache 後爆）。
RUN rm -f package-lock.json
# /api/changelog serves this file — it must be in the image, not just the repo.
COPY CHANGELOG.md VERSION ./
RUN npx turbo run build --filter=admin

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /repo

# Build stamp for GET /api/version. Declared in the LAST stage on purpose:
# an ARG invalidates every layer after it, so putting these next to the
# NEXT_PUBLIC_* args would rebuild the whole app on every commit.
ARG GIT_COMMIT=unknown
ARG BUILT_AT=unknown
ARG APP_VERSION=0.0.0
ENV GIT_COMMIT=$GIT_COMMIT
ENV BUILT_AT=$BUILT_AT
ENV APP_VERSION=$APP_VERSION
COPY --from=build /repo ./
WORKDIR /repo/apps/admin
EXPOSE 3003
CMD ["npm", "run", "start"]
