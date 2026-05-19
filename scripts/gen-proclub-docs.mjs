import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const { PROCLUB_TEMPLATES } = await import(
  pathToFileURL(path.join(root, 'src/lib/proclub-workflow-catalog/index.ts')).href,
)

const lines = [
  '# Catálogo PROCLUB — workflows Furvoley',
  '',
  'Matriz de las 48 plantillas alineadas con PROCLUB CRM. Los flujos ya guardados en BD **no se sobrescriben** al instalar desde la biblioteca.',
  '',
  '| ID | Área | Tipo | Estado | Fase | Disparador | Pasos | Notas |',
  '|----|------|------|--------|------|------------|-------|-------|',
]

for (const t of PROCLUB_TEMPLATES) {
  const actions = t.steps.map((s) => s.actionType).join(', ') || '—'
  lines.push(
    `| ${t.proclubId} | ${t.proclubArea} | ${t.proclubType} | ${t.implementationStatus} | ${t.phase} | \`${t.triggerType}\` | ${actions} | ${t.notes.replace(/\|/g, '/')} |`,
  )
}

const out = path.join(root, 'docs/features/proclub-workflows.md')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8')
console.log('Wrote', out)
