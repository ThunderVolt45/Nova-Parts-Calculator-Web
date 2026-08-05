#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { parseGx } from '../src/gx/parser/gx-parser.ts'
import { parseXfi } from '../src/gx/parser/xfi-parser.ts'

function summarizeGx(filePath, result) {
  const variants = {}
  for (const mesh of result.meshes) {
    const variant = mesh.geometry.metadata.variant
    variants[variant] = (variants[variant] ?? 0) + 1
  }
  return {
    file: path.basename(filePath),
    bytes: result.byteLength,
    chunks: result.chunkCount,
    frames: result.frames.length,
    animatedFrames: result.frames.filter((frame) => frame.keyframes).length,
    meshes: result.meshes.length,
    alphaMeshes: result.meshes.filter((mesh) => mesh.requiresAlpha).length,
    variants,
    diagnostics: result.diagnostics.map((item) => item.code),
  }
}

function summarizeXfi(filePath, result) {
  return {
    file: path.basename(filePath),
    partType: result.partType,
    matrices: result.matrices.length,
    animationRanges: result.animationRanges,
    diagnostics: result.diagnostics.map((item) => item.code),
  }
}

if (process.argv.length <= 2) {
  console.error('Usage: npm run gx:inspect -- <file.gx|file.xfi> [...]')
  process.exitCode = 1
} else {
  const summaries = []
  for (const filePath of process.argv.slice(2)) {
    const data = await readFile(filePath)
    if (path.extname(filePath).toLowerCase() === '.xfi') {
      summaries.push(summarizeXfi(filePath, parseXfi(data.toString('utf8'))))
    } else {
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      summaries.push(summarizeGx(filePath, parseGx(buffer)))
    }
  }
  console.log(JSON.stringify(summaries, null, 2))
}
