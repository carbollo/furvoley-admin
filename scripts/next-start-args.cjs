#!/usr/bin/env node
/** Next.js must listen on :: so Railway private networking (IPv6) can reach the app. */
module.exports = function nextStartArgs() {
  const host = String(process.env.HOSTNAME || '::').trim() || '::'
  return ['next', 'start', '-H', host]
}
