FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
COPY server.mjs ./
COPY lib ./lib
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
ENV PORTAL_DATA_DIR=/data

RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "server.mjs"]
