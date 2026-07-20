# syntax=docker/dockerfile:1
# Authenticator portal (Next.js 14) — build context = REPO ROOT
#   docker build -f apps/authenticator/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000/api -t authentik-authenticator .
# ⚠️ NEXT_PUBLIC_* build-time inline → UAT/PROD 各自 build。
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /repo

FROM base AS deps
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/authenticator/package.json apps/authenticator/package.json
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
COPY apps/authenticator ./apps/authenticator
RUN npx turbo run build --filter=authenticator

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo ./
WORKDIR /repo/apps/authenticator
EXPOSE 3001
CMD ["npm", "run", "start"]
