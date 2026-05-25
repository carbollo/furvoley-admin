#!/bin/sh
set -eu

CONFIG_DIR="${HERMES_HOME:-/opt/data}"
mkdir -p "$CONFIG_DIR"
TEMPLATE="/opt/data/config.yaml.template"

if [ -f "$TEMPLATE" ]; then
  sed \
    -e "s|\${FURVOLEY_MCP_URL}|${FURVOLEY_MCP_URL:-}|g" \
    -e "s|\${HERMES_MCP_API_KEY}|${HERMES_MCP_API_KEY:-}|g" \
    -e "s|\${OLLAMA_MODEL:-gpt-oss:120b}|${OLLAMA_MODEL:-gpt-oss:120b}|g" \
    -e "s|\${WHATSAPP_MODE:-bot}|${WHATSAPP_MODE:-bot}|g" \
    -e "s|\${WHATSAPP_ALLOWED_USERS}|${WHATSAPP_ALLOWED_USERS:-}|g" \
    "$TEMPLATE" > "$CONFIG_DIR/config.yaml"
fi

if [ -n "${OLLAMA_API_KEY:-}" ]; then
  printf 'OLLAMA_API_KEY=%s\n' "$OLLAMA_API_KEY" > "$CONFIG_DIR/.env"
fi

exec hermes "$@"
