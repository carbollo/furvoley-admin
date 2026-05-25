#!/bin/sh
set -eu

CONFIG_DIR="${HERMES_HOME:-/opt/data}"
mkdir -p "$CONFIG_DIR"
TEMPLATE="/opt/data/config.yaml.template"

if [ -f "$TEMPLATE" ]; then
  sed \
    -e "s|\${FURVOLEY_MCP_URL}|${FURVOLEY_MCP_URL:-}|g" \
    -e "s|\${HERMES_MCP_API_KEY}|${HERMES_MCP_API_KEY:-}|g" \
    -e "s|\${DEEPSEEK_API_KEY}|${DEEPSEEK_API_KEY:-}|g" \
    -e "s|\${DEEPSEEK_BASE_URL:-https://api.deepseek.com}|${DEEPSEEK_BASE_URL:-https://api.deepseek.com}|g" \
    -e "s|\${DEEPSEEK_MODEL:-deepseek-chat}|${DEEPSEEK_MODEL:-deepseek-chat}|g" \
    -e "s|\${WHATSAPP_ENABLED:-true}|${WHATSAPP_ENABLED:-true}|g" \
    -e "s|\${WHATSAPP_MODE:-bot}|${WHATSAPP_MODE:-bot}|g" \
    -e "s|\${WHATSAPP_ALLOWED_USERS}|${WHATSAPP_ALLOWED_USERS:-}|g" \
    "$TEMPLATE" > "$CONFIG_DIR/config.yaml"
fi

exec hermes "$@"
