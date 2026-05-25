import { spawnSync } from 'node:child_process'
import net from 'node:net'

export function isTcpPortOpen(port: number, host = '127.0.0.1', timeoutMs = 1500) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ port, host, timeout: timeoutMs })
    const done = (open: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(open)
    }
    socket.on('connect', () => done(true))
    socket.on('error', () => done(false))
    socket.on('timeout', () => done(false))
  })
}

/** Best-effort: free a stale listener before respawning Hermes API Server. */
export function killListenersOnPort(port: number) {
  if (process.platform === 'win32') return
  spawnSync(
    'sh',
    [
      '-c',
      `ss -lptn 'sport = :${port}' 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u | xargs -r kill -TERM 2>/dev/null || true`,
    ],
    { stdio: 'ignore' },
  )
}
