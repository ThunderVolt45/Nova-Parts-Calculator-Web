import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CATALOG_SCHEMA_VERSION = 1
const REFERENCE_REPOSITORY_NAME = 'Nova-Parts-Calculator-Python'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const webRepositoryRoot = resolve(scriptDirectory, '..')
const defaultReferenceRoot = resolve(webRepositoryRoot, '..', REFERENCE_REPOSITORY_NAME)
const referenceRoot = resolve(process.argv[2] ?? defaultReferenceRoot)
const referenceJsonRoot = resolve(referenceRoot, 'JSON')
const outputPath = resolve(
  webRepositoryRoot,
  'src',
  'data',
  'catalog',
  'catalog.snapshot.json',
)

function runGit(...args) {
  return execFileSync('git', ['-C', referenceRoot, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function readJson(fileName) {
  const filePath = resolve(referenceJsonRoot, fileName)
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

const dirtyCatalogFiles = runGit('status', '--porcelain', '--', 'JSON')

if (dirtyCatalogFiles) {
  throw new Error(
    `Reference catalog has uncommitted changes:\n${dirtyCatalogFiles}\n` +
      'Commit or revert them before importing so the source revision remains reproducible.',
  )
}

const sourceRevision = runGit('rev-parse', 'HEAD')
const snapshot = {
  catalogVersion: '',
  sourceRevision,
  source: {
    legs: readJson('parts_leg.json'),
    bodies: readJson('parts_body.json'),
    weapons: readJson('parts_weapon.json'),
    accessories: readJson('parts_acc.json'),
    subcores: readJson('subcore.json'),
  },
}

const overrides = JSON.parse(readFileSync(
  resolve(webRepositoryRoot, 'src/data/catalog/catalog.overrides.json'), 'utf8',
))
for (const change of [...overrides.corrections, ...overrides.changes]) {
  const part = snapshot.source[change.kind].find((item) => item.ID === change.id)
  if (!part || part.Name !== change.name) {
    throw new Error(`Catalog override target mismatch: ${change.kind}/${change.id}`)
  }
  for (const [field, value] of Object.entries(change.values)) {
    if (typeof part[field] !== 'number' || typeof value !== 'number') {
      throw new Error(`Invalid catalog override field: ${change.name}/${field}`)
    }
    part[field] = value
  }
}
const contentHash = createHash('sha256')
  .update(JSON.stringify(snapshot.source)).digest('hex').slice(0, 12)
const catalogVersion = `${CATALOG_SCHEMA_VERSION}-${contentHash}`
snapshot.catalogVersion = catalogVersion

writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')

process.stdout.write(
  `Imported catalog ${catalogVersion} from ${REFERENCE_REPOSITORY_NAME}\n` +
    `Source revision: ${sourceRevision}\n` +
    `Output: ${outputPath}\n`,
)
