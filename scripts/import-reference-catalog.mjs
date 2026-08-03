import { execFileSync } from 'node:child_process'
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
const catalogVersion = `${CATALOG_SCHEMA_VERSION}-${sourceRevision.slice(0, 12)}`
const snapshot = {
  catalogVersion,
  sourceRevision,
  source: {
    legs: readJson('parts_leg.json'),
    bodies: readJson('parts_body.json'),
    weapons: readJson('parts_weapon.json'),
    accessories: readJson('parts_acc.json'),
    subcores: readJson('subcore.json'),
  },
}

writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')

process.stdout.write(
  `Imported catalog ${catalogVersion} from ${REFERENCE_REPOSITORY_NAME}\n` +
    `Source revision: ${sourceRevision}\n` +
    `Output: ${outputPath}\n`,
)
