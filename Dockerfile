# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HERMES_HOME=/root/.hermes

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip git ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m pip install --break-system-packages hermes-agent \
  && mkdir -p /root/.hermes

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/skills ./skills
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE 3000

# Persistencia WhatsApp: monta un Railway Volume en /root/.hermes (no uses VOLUME aquí).
CMD ["node", "scripts/start-with-hermes.cjs"]
