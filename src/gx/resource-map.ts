import { z } from 'zod'

import { partsCatalog } from '../data/catalog/catalog.ts'
import generatedResourceMap from './resource-map.generated.json'
import type { LocalResourceFile, LocalResourceIndex } from './local-files.ts'

export const modelPartKindSchema = z.enum([
  'leg',
  'body',
  'weapon',
  'accessory',
])

const resourceMappingItemSchema = z
  .strictObject({
    kind: modelPartKindSchema,
    partId: z.number().int().positive(),
    partName: z.string().min(1),
    mappingStatus: z.enum(['mapped', 'unresolved']),
    sourceGx: z.string().min(1).nullable(),
    confidence: z.enum(['high', 'medium', 'unresolved']),
    evidence: z.string().min(1).nullable(),
    note: z.string().min(1).nullable(),
  })
  .superRefine((item, context) => {
    if (item.mappingStatus === 'mapped' && item.sourceGx === null) {
      context.addIssue({
        code: 'custom',
        message: 'Mapped resources must name a GX source file.',
        path: ['sourceGx'],
      })
    }
    if (item.mappingStatus === 'unresolved' && item.sourceGx !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Unresolved resources cannot name a GX source file.',
        path: ['sourceGx'],
      })
    }
  })

const resourceMapSchema = z.strictObject({
  mappingVersion: z.string().regex(/^1-[0-9a-f]{12}$/),
  sourceRevision: z.string().regex(/^[0-9a-f]{40}$/),
  catalogVersion: z.string().min(1),
  items: z.array(resourceMappingItemSchema),
})

export type ModelPartKind = z.infer<typeof modelPartKindSchema>
export type ResourceMappingItem = z.infer<typeof resourceMappingItemSchema>

export type PartModelResolution =
  | { status: 'available'; mapping: ResourceMappingItem; file: LocalResourceFile }
  | { status: 'missing-source'; mapping: ResourceMappingItem }
  | { status: 'unresolved'; mapping: ResourceMappingItem }
  | { status: 'unknown-part'; kind: ModelPartKind; partId: number }

export const gxResourceMap = resourceMapSchema.parse(generatedResourceMap)

if (gxResourceMap.catalogVersion !== partsCatalog.catalogVersion) {
  throw new Error(
    `GX resource map catalog mismatch: ${gxResourceMap.catalogVersion} !== ${partsCatalog.catalogVersion}`,
  )
}

const mappingByPart = new Map(
  gxResourceMap.items.map((item) => [`${item.kind}:${item.partId}`, item]),
)

export function getPartResourceMapping(kind: ModelPartKind, partId: number) {
  return mappingByPart.get(`${kind}:${partId}`)
}

export function resolvePartModel(
  kind: ModelPartKind,
  partId: number,
  index: Pick<LocalResourceIndex, 'find'>,
): PartModelResolution {
  const mapping = getPartResourceMapping(kind, partId)
  if (!mapping) return { status: 'unknown-part', kind, partId }
  if (mapping.mappingStatus === 'unresolved') {
    return { status: 'unresolved', mapping }
  }

  const file = index.find(mapping.sourceGx ?? '')
  return file
    ? { status: 'available', mapping, file }
    : { status: 'missing-source', mapping }
}

