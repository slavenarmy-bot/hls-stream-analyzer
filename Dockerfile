# syntax=docker/dockerfile:1
# ============================================================
# Stage 1: Install dependencies
# ============================================================
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN --network=host npm ci --force

# ============================================================
# Stage 2: Build the application
# ============================================================
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY package.json package-lock.json ./
COPY next.config.ts tsconfig.json postcss.config.mjs ./
COPY components.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
COPY public ./public

# Generate Prisma client (outputs to src/generated/prisma)
RUN npx prisma generate

# Build Next.js application
RUN npm run build

# ============================================================
# Stage 3: Production runner
# ============================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy Prisma files needed for migrations at runtime
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Install Prisma CLI with all its dependencies for runtime migrations
RUN --network=host npm install --no-save --force prisma && chown -R nextjs:nodejs node_modules

# Copy Docker-specific Prisma config (without dotenv - env vars set by docker-compose)
COPY --chown=nextjs:nodejs docker-prisma.config.ts ./prisma.config.ts

# Copy the generated Prisma client
COPY --from=builder --chown=nextjs:nodejs /app/src/generated/prisma ./src/generated/prisma

# Copy startup script
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 -qO /dev/null http://localhost:3000/ || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
