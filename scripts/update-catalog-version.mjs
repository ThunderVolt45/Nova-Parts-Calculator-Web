import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CATALOG_SCHEMA_VERSION = 1

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const snapshotPath = resolve(
  scriptDirectory,
  '..',
  'src',
  'data',
  'catalog',
  'catalog.snapshot.json',
)

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'))
const contentHash = createHash('sha256')
  .update(JSON.stringify(snapshot.source)).digest('hex').slice(0, 12)
const catalogVersion = `${CATALOG_SCHEMA_VERSION}-${contentHash}`

if (snapshot.catalogVersion === catalogVersion) {
  process.stdout.write(`Catalog version is up to date: ${catalogVersion}\n`)
} else {
  const previousVersion = snapshot.catalogVersion
  snapshot.catalogVersion = catalogVersion
  writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  process.stdout.write(`Updated catalog version ${previousVersion} -> ${catalogVersion}\n`)
}
