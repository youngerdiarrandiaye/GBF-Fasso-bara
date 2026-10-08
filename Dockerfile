# syntax=docker/dockerfile:1
# Image de production : deps -> build -> runner (Next.js output: standalone).
# Dev local : voir Dockerfile.dev (utilisé par compose.yaml).

# ---- deps ----
FROM node:22.19.0-alpine3.22 AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build ----
FROM node:22.19.0-alpine3.22 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* sont INJECTÉES DANS LE BUNDLE NAVIGATEUR au build : à fournir
# via --build-arg (ce sont des valeurs publiques, jamais de secret ici).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN NODE_ENV=production npm run build

# ---- runner ----
FROM node:22.19.0-alpine3.22 AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Variables RUNTIME (à fournir via compose/env_file, jamais dans l'image) :
#   SUPABASE_INTERNAL_URL, SUPABASE_SERVICE_ROLE_KEY et autres secrets serveur.
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
