export const abilityPartSlotOrder = [
  'leg',
  'body',
  'weapon',
  'accessory',
] as const

export type AbilityPartSlot = (typeof abilityPartSlotOrder)[number]

export interface AbilitySourcePart {
  name: string
  special: string
}

export interface AssemblyAbility {
  slot: AbilityPartSlot
  partName: string
  text: string
  type: 'passive' | 'active'
}

export interface AssemblyAbilities {
  passives: AssemblyAbility[]
  active: AssemblyAbility | null
}

const activeAbilityPattern = /특수\s*기술\s*\(\s*C\s*키\s*\)/i

export function collectAssemblyAbilities(
  parts: Partial<Record<AbilityPartSlot, AbilitySourcePart | undefined>>,
): AssemblyAbilities {
  const passives: AssemblyAbility[] = []
  let active: AssemblyAbility | null = null

  for (const slot of abilityPartSlotOrder) {
    const part = parts[slot]
    const text = part?.special.trim()

    if (!part || !text) continue

    if (activeAbilityPattern.test(text)) {
      active = { slot, partName: part.name, text, type: 'active' }
    } else {
      passives.push({ slot, partName: part.name, text, type: 'passive' })
    }
  }

  return { passives, active }
}
