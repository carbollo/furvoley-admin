#!/usr/bin/env node
/** Optional HOSTNAME override (e.g. :: for Railway private IPv6). Default: Next.js listens on 0.0.0.0. */
module.exports = function nextStartArgs() {
  const host = String(process.env.HOSTNAME || '').trim()
  if (!host) return ['next', 'start']
  return ['next', 'start', '-H', host]
}
