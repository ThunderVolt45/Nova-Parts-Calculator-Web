#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { convertGxToGlb } from '../src/gx/glb-converter.ts'
import {
  parseGx,
  textureReferenceImpliesAlpha,
} from '../src/gx/parser/gx-parser.ts'
import { parseXfi } from '../src/gx/parser/xfi-parser.ts'

function exactArrayBuffer(data) {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
}

function stem(value) {
  const dot = value.lastIndexOf('.')
  return dot > 0 ? value.slice(0, dot) : value
}

async function optionalFile(filePath) {
  try {
    return await readFile(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

if (process.argv.length !== 4) {
  console.error('Usage: npm run gx:convert -- <input.gx> <output.glb>')
  process.exitCode = 1
} else {
  const [, , inputPath, outputPath] = process.argv
  const source = await readFile(inputPath)
  const parsed = parseGx(exactArrayBuffer(source))
  const directory = path.dirname(inputPath)
  const names = await readdir(directory)
  const byName = new Map(names.map((name) => [name.normalize('NFC').toLowerCase(), name]))
  const textures = []
  for (const reference of new Set(parsed.meshes.map((mesh) => mesh.texture).filter(Boolean))) {
    const referenceName = path.basename(reference)
    const wantedStem = stem(referenceName)
    const suffixes = textureReferenceImpliesAlpha(reference)
      ? ['.png', '.tga', '.bmp', '.jpg', '.jpeg']
      : ['.tga', '.bmp', '.png', '.jpg', '.jpeg']
    const direct = byName.get(referenceName.normalize('NFC').toLowerCase())
    const fallback = suffixes
      .map((suffix) => byName.get(`${wantedStem}${suffix}`.normalize('NFC').toLowerCase()))
      .find(Boolean)
    const fileName = direct ?? fallback
    if (!fileName) continue
    const data = await readFile(path.join(directory, fileName))
    textures.push({ reference, fileName, buffer: exactArrayBuffer(data) })
  }
  const xfiPath = path.join(directory, `${stem(path.basename(inputPath))}.xfi`)
  const xfiData = await optionalFile(xfiPath)
  const result = await convertGxToGlb(parsed, {
    sourceName: path.basename(inputPath),
    textures,
    xfi: xfiData ? parseXfi(xfiData.toString('utf8')) : null,
  })
  await writeFile(outputPath, new Uint8Array(result.glb))
  console.log(JSON.stringify({
    output: outputPath,
    bytes: result.glb.byteLength,
    ...result.metadata,
  }, null, 2))
}

