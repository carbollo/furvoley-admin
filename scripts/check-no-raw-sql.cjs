#!/usr/bin/env node
/**
 * Falla si detecta patrones de SQL crudo inseguro en src/ o prisma/.
 */
const { readFileSync, readdirSync, statSync } = require('node:fs')
const { join, extname } = require('node:path')

const ROOT = join(__dirname, '..')
const SCAN_DIRS = ['src', 'prisma']
const EXT = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs'])

const FORBIDDEN = [
  { pattern: /\$queryRawUnsafe\b/, label: '$queryRawUnsafe' },
  { pattern: /\$executeRawUnsafe\b/, label: '$executeRawUnsafe' },
  { pattern: /`SELECT\s+\$\{/i, label: 'SQL concatenado con template literal' },
  { pattern: /`INSERT\s+\$\{/i, label: 'SQL concatenado con template literal' },
  { pattern: /`UPDATE\s+\$\{/i, label: 'SQL concatenado con template literal' },
  { pattern: /`DELETE\s+\$\{/i, label: 'SQL concatenado con template literal' },
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next' || name === 'generated') continue
      walk(full, out)
    } else if (EXT.has(extname(name))) {
      out.push(full)
    }
  }
  return out
}

const hits = []
for (const dir of SCAN_DIRS) {
  const base = join(ROOT, dir)
  try {
    for (const file of walk(base)) {
      const content = readFileSync(file, 'utf8')
      const lines = content.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/**')) continue
        for (const { pattern, label } of FORBIDDEN) {
          if (pattern.test(line)) {
            hits.push({ file: file.replace(ROOT + require('node:path').sep, ''), label, line: i + 1 })
          }
        }
      }
    }
  } catch {
    // directorio ausente
  }
}

if (hits.length) {
  process.stderr.write('[security:sql] Patrones prohibidos encontrados:\n')
  for (const h of hits) {
    process.stderr.write(`  - ${h.file}: ${h.label}\n`)
  }
  process.exit(1)
}

process.stdout.write('[security:sql] OK — sin SQL crudo inseguro detectado.\n')
