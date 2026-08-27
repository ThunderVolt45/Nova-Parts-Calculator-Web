import snapshotInput from './catalog.snapshot.json'
import type { AccessoryPart } from '../../domain/catalog/schema.ts'
import {
  legacyCatalogSnapshotSchema,
  normalizeLegacyCatalog,
} from './legacyCatalog.ts'

function applyVerifiedAccessoryCorrections(part: AccessoryPart): AccessoryPart {
  if (part.id === 45) {
    return { ...part, stats: { ...part.stats, watt: -20 } }
  }
  if (part.id === 51) {
    return { ...part, stats: { ...part.stats, range: 1 } }
  }
  return part
}

const snapshot = legacyCatalogSnapshotSchema.parse(snapshotInput)
const referenceCatalog = normalizeLegacyCatalog(
  snapshot.source,
  snapshot.catalogVersion,
)

export const partsCatalog = {
  ...referenceCatalog,
  parts: {
    ...referenceCatalog.parts,
    accessories: referenceCatalog.parts.accessories.map(
      applyVerifiedAccessoryCorrections,
    ),
  },
}

export const catalogSourceRevision = snapshot.sourceRevision

export const partsCatalogById = {
  legs: new Map(partsCatalog.parts.legs.map((part) => [part.id, part])),
  bodies: new Map(partsCatalog.parts.bodies.map((part) => [part.id, part])),
  weapons: new Map(partsCatalog.parts.weapons.map((part) => [part.id, part])),
  accessories: new Map(
    partsCatalog.parts.accessories.map((part) => [part.id, part]),
  ),
  subcores: new Map(partsCatalog.subcores.map((subcore) => [subcore.id, subcore])),
} as const
