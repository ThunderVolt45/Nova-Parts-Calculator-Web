import { copyFile, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectDirectory = path.resolve(scriptDirectory, '..')
const publicDirectory = path.join(projectDirectory, 'public')

const packageManifest = JSON.parse(
  await readFile(path.join(projectDirectory, 'package.json'), 'utf8'),
)
const packageLock = JSON.parse(
  await readFile(path.join(projectDirectory, 'package-lock.json'), 'utf8'),
)
const referenceNotices = await readFile(
  path.join(projectDirectory, 'licenses', 'REFERENCE_PROJECTS.txt'),
  'utf8',
)

const directDevelopmentDependencies = new Set(
  Object.keys(packageManifest.devDependencies ?? {}),
)
const directDevelopmentLocations = new Set(
  [...directDevelopmentDependencies].map((name) => `node_modules/${name}`),
)
const noticeFilePattern = /^(?:licen[cs]e|copying|notice)(?:\..*)?$/i

const mitTerms = (copyrightNotice) => `MIT License

${copyrightNotice}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

const missingMitLicenseNotices = new Map([
  [
    '@react-three/fiber@9.7.0',
    mitTerms('Copyright (c) 2019-2025 Poimandres'),
  ],
  ['maath@0.10.8', mitTerms('Copyright (c) 2020 Poimandres')],
  [
    'stats-gl@2.4.2',
    mitTerms('Copyright (c) Renaud ROHLINGER and contributors'),
  ],
])

const canonicalLicenseSources = new Map([
  ['Apache-2.0', '@dimforge/rapier3d-compat'],
])

function normalizeNoticeText(text) {
  return text.replace(/[ \t]+$/gm, '').trim()
}

function normalizeLicense(license) {
  if (typeof license === 'string' && license.trim()) {
    return license.trim()
  }
  if (license && typeof license.type === 'string') {
    return license.type.trim()
  }
  return 'See included license text'
}

function normalizeRepository(repository, fallback) {
  const value =
    typeof repository === 'string'
      ? repository
      : typeof repository?.url === 'string'
        ? repository.url
        : fallback

  return value
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '')
}

async function readNoticeFiles(packageDirectory) {
  const entries = await readdir(packageDirectory)
  const candidates = entries
    .filter((entry) => noticeFilePattern.test(entry))
    .sort((left, right) => left.localeCompare(right, 'en'))
  const notices = []

  for (const filename of candidates) {
    const filepath = path.join(packageDirectory, filename)
    if (!(await stat(filepath)).isFile()) {
      continue
    }
    notices.push({
      filename,
      text: normalizeNoticeText(await readFile(filepath, 'utf8')),
    })
  }

  return notices
}

const packagesByIdentity = new Map()

for (const [location, lockEntry] of Object.entries(packageLock.packages)) {
  if (!location.startsWith('node_modules/')) {
    continue
  }

  const isDirectDevelopmentTool = directDevelopmentLocations.has(location)
  if (lockEntry.dev === true && !isDirectDevelopmentTool) {
    continue
  }

  const packageDirectory = path.join(projectDirectory, location)
  const manifest = JSON.parse(
    await readFile(path.join(packageDirectory, 'package.json'), 'utf8'),
  )
  const notices = await readNoticeFiles(packageDirectory)
  const identity = `${manifest.name}@${manifest.version}`
  const existing = packagesByIdentity.get(identity)
  const usage = lockEntry.dev === true ? 'development tool' : 'runtime dependency'

  if (existing?.usage === 'runtime dependency') {
    continue
  }

  packagesByIdentity.set(identity, {
    name: manifest.name,
    version: manifest.version,
    license: normalizeLicense(manifest.license),
    repository: normalizeRepository(manifest.repository, lockEntry.resolved ?? ''),
    notices,
    usage,
  })
}

const packages = [...packagesByIdentity.values()].sort((left, right) =>
  `${left.name}@${left.version}`.localeCompare(
    `${right.name}@${right.version}`,
    'en',
  ),
)

const canonicalLicenseTexts = new Map()

for (const packageInfo of packages) {
  const canonicalSource = canonicalLicenseSources.get(packageInfo.license)
  if (packageInfo.name !== canonicalSource) {
    continue
  }

  const licenseNotice = packageInfo.notices.find((notice) =>
    /^(?:licen[cs]e|copying)(?:\..*)?$/i.test(notice.filename),
  )
  if (licenseNotice) {
    canonicalLicenseTexts.set(packageInfo.license, licenseNotice.text)
  }
}

for (const packageInfo of packages) {
  if (packageInfo.notices.length > 0) {
    continue
  }

  const identity = `${packageInfo.name}@${packageInfo.version}`
  const mitNotice = missingMitLicenseNotices.get(identity)
  if (mitNotice) {
    packageInfo.notices.push({
      filename: 'UPSTREAM-MIT-LICENSE.txt',
      text: mitNotice,
    })
    packageInfo.noticeSource =
      'the published package omitted its license file; this MIT notice preserves the attribution stated by the upstream project or package metadata.'
    continue
  }

  const canonicalLicenseText = canonicalLicenseTexts.get(packageInfo.license)
  if (canonicalLicenseText) {
    packageInfo.notices.push({
      filename: `SPDX-${packageInfo.license}.txt`,
      text: canonicalLicenseText,
    })
    packageInfo.noticeSource =
      `the published package omitted its license file; the canonical ${packageInfo.license} terms are reproduced below.`
    continue
  }

  throw new Error(
    `${identity} 패키지의 ${packageInfo.license} 라이선스 원문을 찾지 못했습니다.`,
  )
}

const divider = '-'.repeat(79)
const output = [
  'NOVA ASSEMBLY OPEN SOURCE AND THIRD-PARTY LICENSES',
  '='.repeat(55),
  '',
  'This file is generated by `npm run licenses:generate` from the reference',
  'project notices, package-lock.json, and license files distributed with the',
  'installed npm packages. Do not edit this generated file directly.',
  '',
  'The Nova Assembly project license is available separately at /LICENSE.txt.',
  'Nova 1492 names, trademarks, and original game assets are not licensed by',
  'this file.',
  '',
  referenceNotices.trim(),
  '',
  'NPM PACKAGE NOTICES',
  '===================',
  '',
  'Runtime dependencies are included because they may be distributed in the',
  'browser application. Direct development tools are listed for attribution',
  'but are not included in the production browser bundle.',
  '',
]

for (const packageInfo of packages) {
  output.push(
    divider,
    `${packageInfo.name}@${packageInfo.version}`,
    divider,
    `Usage: ${packageInfo.usage}`,
    `Declared license: ${packageInfo.license}`,
    `Source: ${packageInfo.repository}`,
    ...(packageInfo.noticeSource
      ? [`License text note: ${packageInfo.noticeSource}`]
      : []),
    '',
  )

  for (const notice of packageInfo.notices) {
    output.push(`[${notice.filename}]`, notice.text, '')
  }
}

await copyFile(
  path.join(projectDirectory, 'LICENSE'),
  path.join(publicDirectory, 'LICENSE.txt'),
)
await writeFile(
  path.join(publicDirectory, 'THIRD_PARTY_LICENSES.txt'),
  `${output.join('\n').trim()}\n`,
  'utf8',
)

console.log(
  `Generated license notices for ${packages.length} npm packages in public/THIRD_PARTY_LICENSES.txt.`,
)
