# ---- Stage 1: Dependencies ----
FROM node:20-slim AS deps

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# ---- Stage 2: Build ----
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p public data
# Initialize DB schema before build so Next.js can pre-render API routes
RUN npx drizzle-kit push 2>/dev/null || true
# Limit build workers to 1 to prevent concurrent SQLite access
ENV NEXT_BUILD_WORKERS=1
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# ---- Stage 3: Production ----
FROM node:20-slim AS runner

# Install runtime deps for better-sqlite3 and Puppeteer's Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use the system Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

COPY --from=builder /app/public ./public

# Create data & upload directories (will be mounted as volumes)
RUN mkdir -p data uploads && chown -R nextjs:nodejs data uploads

# Copy CSV seed data for company directory import
COPY --from=builder /app/docs/csv ./docs/csv
RUN chown -R nextjs:nodejs docs

# Push schema on startup to ensure DB is up to date.
# We need drizzle-kit + config + schema for this.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src/db/schema.ts ./src/db/schema.ts
COPY --from=builder /app/package.json ./

USER nextjs

EXPOSE 3000

# Run DB migrations then start the server
CMD ["sh", "-c", "npx drizzle-kit push && node server.js"]
