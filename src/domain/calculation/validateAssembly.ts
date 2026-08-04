import { z } from 'zod'

import type { CalculationCatalog } from './calculateBaseStats.ts'
import { assemblyPartIdsSchema, type AssemblyPartIds } from './schema.ts'

export const assemblyValidationStatusSchema = z.enum([
  'complete',
  'parts-missing',
  'mount-type-mismatch',
  'load-exceeded',
  'n-part-limit-exceeded',
  'apocalypse-body-too-light',
  'apocalypse-towering-conflict',
])

export const assemblyValidationIssueSchema = z.enum([
  'leg-missing',
  'body-missing',
  'weapon-missing',
  'mount-type-mismatch',
  'load-exceeded',
  'n-part-limit-exceeded',
  'apocalypse-body-too-light',
  'apocalypse-towering-conflict',
])

const invalidPartSlotSchema = z.enum(['leg', 'body', 'weapon', 'accessory'])

export const assemblyValidationResultSchema = z.strictObject({
  isValid: z.boolean(),
  status: assemblyValidationStatusSchema,
  issues: z.array(assemblyValidationIssueSchema),
  invalidPartSlots: z.array(invalidPartSlotSchema),
  weightInvalid: z.boolean(),
})

export type AssemblyValidationStatus = z.infer<
  typeof assemblyValidationStatusSchema
>
export type AssemblyValidationIssue = z.infer<
  typeof assemblyValidationIssueSchema
>
export type InvalidPartSlot = z.infer<typeof invalidPartSlotSchema>
export type AssemblyValidationResult = z.infer<
  typeof assemblyValidationResultSchema
>

export const assemblyValidationMessages: Record<AssemblyValidationStatus, string> = {
  complete: '조립 완료',
  'parts-missing': '부품 없음',
  'mount-type-mismatch': '형태 불일치',
  'load-exceeded': '하중 초과',
  'n-part-limit-exceeded': 'N템 개수 초과',
  'apocalypse-body-too-light': '무게 30 이상 몸통 필요',
  'apocalypse-towering-conflict': '타워링과 조립 불가',
}

export const assemblyValidationIssueMessages: Record<
  AssemblyValidationIssue,
  string
> = {
  'leg-missing': '다리 부품이 없습니다.',
  'body-missing': '몸통 부품이 없습니다.',
  'weapon-missing': '무기 부품이 없습니다.',
  'mount-type-mismatch': '몸통과 무기의 형태가 일치하지 않습니다.',
  'load-exceeded': '부품 무게가 다리의 하중을 초과했습니다.',
  'n-part-limit-exceeded': 'N 부품은 하나만 장착할 수 있습니다.',
  'apocalypse-body-too-light': '아포칼립스는 무게 30 이상의 몸통이 필요합니다.',
  'apocalypse-towering-conflict': '아포칼립스는 타워링 액세서리와 조립할 수 없습니다.',
}

const APOCALYPSE_WEAPON_ID = 60
const APOCALYPSE_MINIMUM_BODY_WEIGHT = 30
const invalidPartSlotOrder: ReadonlyArray<InvalidPartSlot> = [
  'leg',
  'body',
  'weapon',
  'accessory',
]

function requireCatalogItem<T>(
  items: ReadonlyMap<number, T>,
  id: number,
  category: string,
): T {
  const item = items.get(id)

  if (!item) {
    throw new Error(`Unknown ${category} catalog ID: ${id}`)
  }

  return item
}

export function validateAssembly(
  partIds: AssemblyPartIds,
  catalog: CalculationCatalog,
): AssemblyValidationResult {
  const leg = requireCatalogItem(catalog.legs, partIds.leg, 'leg')
  const body = requireCatalogItem(catalog.bodies, partIds.body, 'body')
  const weapon = requireCatalogItem(catalog.weapons, partIds.weapon, 'weapon')
  const accessory = requireCatalogItem(
    catalog.accessories,
    partIds.accessory,
    'accessory',
  )
  const issues: AssemblyValidationIssue[] = []
  const invalidPartSlots = new Set<InvalidPartSlot>()

  if (leg.id === 0) {
    issues.push('leg-missing')
    invalidPartSlots.add('leg')
  }
  if (body.id === 0) {
    issues.push('body-missing')
    invalidPartSlots.add('body')
  }
  if (weapon.id === 0) {
    issues.push('weapon-missing')
    invalidPartSlots.add('weapon')
  }

  const hasMountTypeMismatch =
    body.id !== 0 && weapon.id !== 0 && body.mountType !== weapon.mountType
  if (hasMountTypeMismatch) {
    issues.push('mount-type-mismatch')
    invalidPartSlots.add('body')
    invalidPartSlots.add('weapon')
  }

  const usedWeight = body.weight + weapon.weight + accessory.weight
  const weightInvalid = usedWeight > leg.loadCapacity
  if (weightInvalid) {
    issues.push('load-exceeded')
    invalidPartSlots.add('leg')
  }

  const nParts = [leg, body, weapon].filter((part) => part.isNPart)
  const hasTooManyNParts = nParts.length > 1
  if (hasTooManyNParts) {
    issues.push('n-part-limit-exceeded')
    if (leg.isNPart) invalidPartSlots.add('leg')
    if (body.isNPart) invalidPartSlots.add('body')
    if (weapon.isNPart) invalidPartSlots.add('weapon')
  }

  const isApocalypse = weapon.id === APOCALYPSE_WEAPON_ID
  const hasLightApocalypseBody =
    isApocalypse && body.weight < APOCALYPSE_MINIMUM_BODY_WEIGHT
  if (hasLightApocalypseBody) {
    issues.push('apocalypse-body-too-light')
    invalidPartSlots.add('body')
  }

  const hasApocalypseToweringConflict =
    isApocalypse && accessory.toweringEffect !== 'none'
  if (hasApocalypseToweringConflict) {
    issues.push('apocalypse-towering-conflict')
    invalidPartSlots.add('accessory')
  }

  const hasMissingParts = leg.id === 0 || body.id === 0 || weapon.id === 0
  let status: AssemblyValidationStatus = 'complete'
  if (hasMissingParts) {
    status = 'parts-missing'
  } else if (hasMountTypeMismatch) {
    status = 'mount-type-mismatch'
  } else if (weightInvalid) {
    status = 'load-exceeded'
  } else if (hasTooManyNParts) {
    status = 'n-part-limit-exceeded'
  } else if (hasLightApocalypseBody) {
    status = 'apocalypse-body-too-light'
  } else if (hasApocalypseToweringConflict) {
    status = 'apocalypse-towering-conflict'
  }

  return assemblyValidationResultSchema.parse({
    isValid: status === 'complete',
    status,
    issues,
    invalidPartSlots: invalidPartSlotOrder.filter((slot) =>
      invalidPartSlots.has(slot),
    ),
    weightInvalid,
  })
}

export const assemblyValidationInputSchema = assemblyPartIdsSchema
