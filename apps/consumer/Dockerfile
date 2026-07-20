# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────
# Consumer (Next.js 14)  —  build context = REPO ROOT
#   docker build -f apps/consumer/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000/api \
#     -t authentik-consumer .
#
# ⚠️ NEXT_PUBLIC_* 喺 `next build` 時被 inline 入 bundle，唔係 runtime read。
#    所以 UAT / PROD 因 API port 唔同 → 要各自 build 一個 image（tag 分開）。
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /repo

# ---- deps ----
FROM base AS deps
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/consumer/package.json      apps/consumer/package.json
COPY packages/utils/package.json     packages/utils/package.json
COPY packages/ui/package.json        packages/ui/package.json
COPY packages/config/package.json    packages/config/package.json
COPY packages/api-client/package.json packages/api-client/package.json
# npm install（唔用 ci）：lockfile 喺 Mac 整，冇 Linux/alpine 嘅 Next SWC
# optional dep（@next/swc-linux-arm64-musl）→ install 按平台補返。CLAUDE.md CI #? 同源。
RUN npm install --no-audit --no-fund

# ---- build ----
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
COPY apps/consumer ./apps/consumer
RUN npx turbo run build --filter=consumer

# ---- runner ----
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo ./
WORKDIR /repo/apps/consumer
EXPOSE 3008
CMD ["npm", "run", "start"]
