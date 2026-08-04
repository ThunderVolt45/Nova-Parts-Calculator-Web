import type { WeaponPart } from '../catalog/schema.ts'

export interface ArmorPierceBreakdown {
  flat: number
  percent: number | null
}

const percentArmorPiercePattern = /방어력\s*(\d+(?:\.\d+)?)\s*%\s*무시/

export function getArmorPierceBreakdown(
  weapon: Pick<WeaponPart, 'special'>,
  flatArmorPierce: number,
): ArmorPierceBreakdown {
  const percentMatch = weapon.special.match(percentArmorPiercePattern)

  return {
    flat: flatArmorPierce,
    percent: percentMatch ? Number(percentMatch[1]) : null,
  }
}
