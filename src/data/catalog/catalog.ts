import snapshotInput from './catalog.snapshot.json'
import {
  legacyCatalogSnapshotSchema,
  normalizeLegacyCatalog,
} from './legacyCatalog.ts'

const snapshot = legacyCatalogSnapshotSchema.parse(snapshotInput)

export const partsCatalog = normalizeLegacyCatalog(
  snapshot.source,
  snapshot.catalogVersion,
)

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
