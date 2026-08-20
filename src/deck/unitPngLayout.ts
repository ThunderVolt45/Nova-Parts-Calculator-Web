import { partsCatalogById } from '../data/catalog/catalog.ts'
import type { Part, PartSlot, StatModifiers } from '../domain/catalog/schema.ts'
import { getArmorPierceBreakdown } from '../domain/calculation/armorPierce.ts'
import { calculateBaseStats } from '../domain/calculation/calculateBaseStats.ts'
import { calculateFinalStats } from '../domain/calculation/calculateFinalStats.ts'
import {
  getDamageReinforcement,
  getHealthReinforcement,
  getWattReinforcement,
} from '../domain/calculation/reinforcement.ts'
import { emptySimulationInput } from '../domain/calculation/simulationSchema.ts'
import {
  collectAssemblyAbilities,
  type AssemblyAbility,
} from '../domain/calculation/specialAbilities.ts'
import type { SavedUnit } from '../domain/deck/schema.ts'

export const UNIT_PNG_EXPORT_SIZE = {
  width: 1600,
  height: 1000,
} as const

export type UnitPngPartStatLayout = {
  key: 'watt' | 'health' | 'damage'
  label: string
  value: string
  bonus: string | null
  reinforcementLevel: number | null
}

export type UnitPngPartLayout = {
  slot: 'leg' | 'body' | 'weapon' | 'accessory'
  slotLabel: string
  mark: string
  name: string
  badges: string[]
  primaryStats: UnitPngPartStatLayout[]
  specs: string[]
  reinforcement: string | null
  subcore: string | null
  special: string
}

export type UnitPngStatLayout = {
  label: string
  value: string
  hint?: string
}

export type UnitPngPrimaryStatLayout = UnitPngStatLayout & {
  mark: 'W' | 'H' | 'D'
  tone: 'watt' | 'health' | 'damage'
}

export type UnitPngLayout = {
  name: string
  catalogVersion: string
  parts: UnitPngPartLayout[]
  weight: {
    used: string
    capacity: string
    remaining: string
    percent: number
  }
  primaryStats: UnitPngPrimaryStatLayout[]
  secondaryStats: UnitPngStatLayout[]
  abilities: AssemblyAbility[]
  targetLabel: string
}

const slotDetails = {
  leg: { label: '다리', mark: 'L' },
  body: { label: '몸통', mark: 'B' },
  weapon: { label: '무기', mark: 'W' },
  accessory: { label: '액세서리', mark: 'A' },
} as const

const mountLabels = {
  none: null,
  tower: '탑형',
  arm: '팔형',
  shoulder: '어깨형',
} as const

const statLabels: ReadonlyArray<{
  key: keyof StatModifiers
  label: string
  suffix?: string
}> = [
  { key: 'wattPercent', label: '와트', suffix: '%' },
  { key: 'healthPercent', label: '체력', suffix: '%' },
  { key: 'damagePercent', label: '공격', suffix: '%' },
  { key: 'armor', label: '방어' },
  { key: 'armorPierce', label: '방어 무시' },
  { key: 'speed', label: '속도' },
  { key: 'cooldown', label: '연사' },
  { key: 'range', label: '사거리' },
  { key: 'minimumRange', label: '최소 사거리' },
  { key: 'splashRadius', label: '범위' },
  { key: 'splashDamageReductionPercent', label: '범위 피해 감소', suffix: '%' },
  { key: 'sight', label: '시야' },
  { key: 'regenerationPercent', label: '리젠', suffix: '%' },
  { key: 'damagePerHealthPercent', label: '체력 비례 피해', suffix: '%' },
]

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(value)
}

function formatModifier(label: string, value: number, suffix = '') {
  return `${label} ${value > 0 ? '+' : ''}${formatNumber(value)}${suffix}`
}

function getPartSpecs(part: Part) {
  const specs = 'loadCapacity' in part
    ? [`하중 ${formatNumber(part.loadCapacity)}`]
    : [`무게 ${formatNumber(part.weight)}`]

  for (const { key, label, suffix } of statLabels) {
    const value = part.stats[key]
    if (value !== 0) specs.push(formatModifier(label, value, suffix))
  }

  return specs
}

function formatSignedNumber(value: number) {
  return `${value >= 0 ? '+' : '−'}${formatNumber(Math.abs(value))}`
}

function getPartReinforcementBonus(
  slot: PartSlot,
  key: UnitPngPartStatLayout['key'],
  part: Part,
  level: number,
) {
  if (key === 'watt') {
    return -getWattReinforcement(part.stats.watt, level, false)
  }
  if (key === 'health') {
    return getHealthReinforcement(
      slot === 'body' ? part.stats.health : part.stats.watt,
      level,
      slot === 'body',
      false,
    )
  }
  return getDamageReinforcement(
    slot === 'weapon' ? part.stats.damage : part.stats.watt,
    level,
    slot === 'weapon',
    false,
  )
}

function createPrimaryStats(
  slot: UnitPngPartLayout['slot'],
  part: Part,
  unit: SavedUnit,
): UnitPngPartStatLayout[] {
  const items = [
    { key: 'watt', label: '와트' },
    { key: 'health', label: '체력' },
    { key: 'damage', label: '공격' },
  ] as const

  return items.map(({ key, label }) => {
    if (slot === 'accessory') {
      return {
        key,
        label,
        value: formatNumber(part.stats[key]),
        bonus: null,
        reinforcementLevel: null,
      }
    }

    const reinforcementLevel = unit.reinforcement[slot][key]
    return {
      key,
      label,
      value: formatNumber(part.stats[key]),
      bonus: formatSignedNumber(
        getPartReinforcementBonus(slot, key, part, reinforcementLevel),
      ),
      reinforcementLevel,
    }
  })
}

function createPartLayout(
  slot: UnitPngPartLayout['slot'],
  part: Part,
  unit: SavedUnit,
): UnitPngPartLayout {
  const detail = slotDetails[slot]
  const mountLabel = 'mountType' in part ? mountLabels[part.mountType] : null
  let subcoreLabel: string | null = null
  if (slot !== 'accessory') {
    const subcore = partsCatalogById.subcores.get(unit.subcoreIds[slot])
    if (subcore) {
      subcoreLabel = `${subcore.name} · ${subcore.descriptionsBySlot[slot] || '추가 효과 없음'}`
    }
  }

  return {
    slot,
    slotLabel: detail.label,
    mark: detail.mark,
    name: part.id === 0 ? '부품 없음' : part.name,
    badges: [mountLabel, part.isNPart ? 'N PART' : null]
      .filter((badge): badge is string => Boolean(badge)),
    primaryStats: createPrimaryStats(slot, part, unit),
    specs: getPartSpecs(part),
    reinforcement: slot === 'accessory'
      ? `랜덤 옵션 · 체력 ${unit.accessoryRandomOptions.health} · 공격 ${unit.accessoryRandomOptions.damage} · 방어 ${unit.accessoryRandomOptions.armor}`
      : null,
    subcore: subcoreLabel,
    special: part.special.trim(),
  }
}

function requirePart<T extends Part>(part: T | undefined, slot: string): T {
  if (!part) throw new Error(`${slot} 부품 정보를 찾을 수 없습니다.`)
  return part
}

function collectAllPartAbilities(parts: {
  leg: Part
  body: Part
  weapon: Part
  accessory: Part
}) {
  return (Object.keys(parts) as Array<keyof typeof parts>).flatMap((slot) => {
    const collected = collectAssemblyAbilities({ [slot]: parts[slot] })
    return [...collected.passives, ...(collected.active ? [collected.active] : [])]
  })
}

export function createUnitPngLayout(unit: SavedUnit): UnitPngLayout {
  const leg = requirePart(partsCatalogById.legs.get(unit.partIds.leg), '다리')
  const body = requirePart(partsCatalogById.bodies.get(unit.partIds.body), '몸통')
  const weapon = requirePart(partsCatalogById.weapons.get(unit.partIds.weapon), '무기')
  const accessory = requirePart(
    partsCatalogById.accessories.get(unit.partIds.accessory),
    '액세서리',
  )
  const calculationInput = { ...unit, calculateAsFloat: false }
  const base = calculateBaseStats(calculationInput, partsCatalogById)
  const final = calculateFinalStats(
    base,
    calculationInput,
    emptySimulationInput,
    partsCatalogById,
  )
  const armorPierce = getArmorPierceBreakdown(weapon, base.armorPierce)
  const armorPierceLabel = [
    armorPierce.percent === null ? null : `${formatNumber(armorPierce.percent)}%`,
    armorPierce.flat !== 0 || armorPierce.percent === null
      ? formatNumber(armorPierce.flat)
      : null,
  ].filter((value): value is string => value !== null).join(' + ')
  const targetLabel = [
    base.attackTargets.ground ? '지상' : null,
    base.attackTargets.air ? '공중' : null,
  ].filter(Boolean).join(' · ') || '공격 불가'

  return {
    name: unit.name,
    catalogVersion: unit.catalogVersion,
    parts: [
      createPartLayout('leg', leg, unit),
      createPartLayout('body', body, unit),
      createPartLayout('weapon', weapon, unit),
      createPartLayout('accessory', accessory, unit),
    ],
    weight: {
      used: formatNumber(base.usedWeight),
      capacity: formatNumber(base.loadCapacity),
      remaining: formatNumber(Math.max(0, base.loadCapacity - base.usedWeight)),
      percent: Math.min(
        100,
        base.loadCapacity > 0 ? (base.usedWeight / base.loadCapacity) * 100 : 0,
      ),
    },
    primaryStats: [
      { label: '와트', value: formatNumber(base.watt), mark: 'W', tone: 'watt' },
      { label: '체력', value: formatNumber(final.health), mark: 'H', tone: 'health' },
      {
        label: '공격력',
        value: final.damage === null ? '없음' : formatNumber(final.damage),
        mark: 'D',
        tone: 'damage',
      },
    ],
    secondaryStats: [
      { label: '방어력', value: formatNumber(final.armor) },
      { label: '속도', value: formatNumber(final.speed) },
      { label: '연사', value: formatNumber(final.cooldown), hint: '100 = 1초' },
      { label: '사거리', value: formatNumber(final.range) },
      { label: '최소 사거리', value: formatNumber(final.minimumRange) },
      { label: '범위', value: formatNumber(base.splashRadius) },
      { label: '시야', value: formatNumber(final.sight) },
      { label: '리젠량', value: formatNumber(final.regenerationAmount), hint: '5초 당' },
      { label: '리젠율', value: `${formatNumber(base.regenerationPercent)}%` },
      { label: '체력 비례 피해', value: `${formatNumber(base.damagePerHealthPercent)}%` },
      { label: '방어 무시', value: armorPierceLabel },
      { label: '회복량', value: formatNumber(final.healAmount) },
      { label: '공격 대상', value: targetLabel },
    ],
    abilities: collectAllPartAbilities({ leg, body, weapon, accessory }),
    targetLabel,
  }
}
