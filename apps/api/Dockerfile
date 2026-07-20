# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────
# Authentik API (NestJS 10 + Prisma)  —  build context = REPO ROOT
#   docker build -f apps/api/Dockerfile -t authentik-api .
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
# Prisma engine 喺 alpine 要 openssl；libc6-compat 畀 native binary
RUN apk add --no-cache openssl libc6-compat
WORKDIR /repo

# ---- deps：只 copy manifest，最大化 layer cache ----
FROM base AS deps
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json           apps/api/package.json
COPY packages/utils/package.json     packages/utils/package.json
COPY packages/ui/package.json        packages/ui/package.json
COPY packages/config/package.json    packages/config/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN npm ci

# ---- build：prisma generate + turbo build（連 @authentik/utils）----
FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npx turbo run build --filter=api

# ---- runner：瘦身 runtime ----
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/node_modules        ./node_modules
COPY --from=build /repo/packages            ./packages
COPY --from=build /repo/apps/api/dist       ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/prisma     ./apps/api/prisma
COPY apps/api/docker-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh
WORKDIR /repo/apps/api
EXPOSE 4000
ENTRYPOINT ["api-entrypoint.sh"]
CMD ["node", "dist/main.js"]
