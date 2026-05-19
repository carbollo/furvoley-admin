import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'data', 'workflow-templates', 'proclub', 'v1')

const catalogUrl = pathToFileURL(
  path.join(root, 'src/lib/proclub-workflow-catalog/index.ts'),
).href

const { getProclubManifest, PROCLUB_TEMPLATES } = await import(catalogUrl)

fs.mkdirSync(outDir, { recursive: true })

const manifest = getProclubManifest()
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

for (const t of PROCLUB_TEMPLATES) {
  const payload = {
    format: 'furvoley-workflows',
    version: 1,
    proclubId: t.proclubId,
    proclubArea: t.proclubArea,
    proclubType: t.proclubType,
    implementationStatus: t.implementationStatus,
    phase: t.phase,
    notes: t.notes,
    name: t.name,
    description: t.description,
    triggerType: t.triggerType,
    isActive: t.defaultActive,
    steps: t.steps,
  }
  fs.writeFileSync(
    path.join(outDir, `${t.proclubId}.json`),
    JSON.stringify(payload, null, 2),
    'utf8',
  )
}

console.log(`Exported ${PROCLUB_TEMPLATES.length} templates to ${outDir}`)
