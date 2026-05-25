# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# postinstall runs prisma generate; schema is not copied yet in this stage
RUN npm ci --ignore-scripts

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
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
ENV PATH="/usr/local/bin:${PATH}"
ENV HERMES_BIN=hermes
ENV HERMES_BRIDGE_SCRIPT=/opt/hermes-whatsapp-bridge/bridge.js

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip git ca-certificates curl openssl \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m pip install --break-system-packages hermes-agent \
  && mkdir -p /root/.hermes

COPY --from=builder /app/scripts ./scripts
RUN mkdir -p /opt/hermes-whatsapp-bridge \
  && curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/whatsapp-bridge/bridge.js -o /opt/hermes-whatsapp-bridge/bridge.js \
  && curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/whatsapp-bridge/allowlist.js -o /opt/hermes-whatsapp-bridge/allowlist.js \
  && curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/whatsapp-bridge/package.json -o /opt/hermes-whatsapp-bridge/package.json \
  && curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/whatsapp-bridge/package-lock.json -o /opt/hermes-whatsapp-bridge/package-lock.json \
  && python3 scripts/patch-hermes-bridge-qr.py /opt/hermes-whatsapp-bridge/bridge.js \
  && cd /opt/hermes-whatsapp-bridge && npm ci --silent \
  && SITE=$(python3 -c "import site; print(site.getsitepackages()[0])") \
  && mkdir -p "$SITE/scripts" \
  && ln -sfn /opt/hermes-whatsapp-bridge "$SITE/scripts/whatsapp-bridge"

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/skills ./skills
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE 3000

# Persistencia WhatsApp: monta un Railway Volume en /root/.hermes (no uses VOLUME aquí).
CMD ["node", "scripts/start-with-hermes.cjs"]
