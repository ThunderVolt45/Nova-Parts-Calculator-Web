#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { parseGx } from '../src/gx/parser/gx-parser.ts'
import { parseXfi } from '../src/gx/parser/xfi-parser.ts'
import {
  buildUnitSocketAssembly,
  describePartSockets,
  transformGltfPoint,
} from '../src/gx/socket-assembly.ts'

async function parsePart(filePath) {
  const gxData = await readFile(filePath)
  const gxBuffer = gxData.buffer.slice(
    gxData.byteOffset,
    gxData.byteOffset + gxData.byteLength,
  )
  const xfiPath = filePath.replace(/\.[^.]+$/, '.xfi')
  const [parsed, xfiText] = await Promise.all([
    Promise.resolve(parseGx(gxBuffer)),
    readFile(xfiPath, 'utf8'),
  ])
  return {
    file: path.basename(filePath),
    metadata: describePartSockets(parsed, parseXfi(xfiText)),
  }
}

if (process.argv.length !== 5) {
  console.error('Usage: npm run gx:assembly -- <legs.gx> <body.gx> <weapon.gx>')
  process.exitCode = 1
} else {
  const [legs, body, weapon] = await Promise.all(
    process.argv.slice(2).map(parsePart),
  )
  const assembly = buildUnitSocketAssembly(legs.metadata, body.metadata)
  console.log(JSON.stringify({
    sources: [legs.file, body.file, weapon.file],
    weaponSocketIndex: assembly.weaponSocketIndex,
    legsPrimaryFrame: assembly.legsPrimaryFrame,
    bodyPrimaryFrame: assembly.bodyPrimaryFrame,
    legsPrimaryTranslation: [
      legs.metadata.primaryFrameTransform[3],
      legs.metadata.primaryFrameTransform[7],
      legs.metadata.primaryFrameTransform[11],
    ],
    bodyPrimaryTranslation: [
      body.metadata.primaryFrameTransform[3],
      body.metadata.primaryFrameTransform[7],
      body.metadata.primaryFrameTransform[11],
    ],
    bodySocketTranslation: [
      assembly.bodySocket[12],
      assembly.bodySocket[13],
      assembly.bodySocket[14],
    ],
    weaponSocketTranslation: [
      assembly.weaponSocket[12],
      assembly.weaponSocket[13],
      assembly.weaponSocket[14],
    ],
    bodyOrigin: transformGltfPoint(assembly.bodyTransform, [0, 0, 0]),
    weaponOrigin: transformGltfPoint(assembly.weaponTransform, [0, 0, 0]),
  }, null, 2))
}
