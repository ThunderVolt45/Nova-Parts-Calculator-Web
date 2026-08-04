export function getWattBase(watt: number): number {
  return watt / 4
}

export function getHealthBase(value: number, isBody: boolean): number {
  if (isBody) {
    return 50 + value / 4
  }

  return value <= 70 ? 50 : 50 + (value - 70) / 4
}

export function getDamageBase(value: number, isWeapon: boolean): number {
  if (isWeapon) {
    return value / 4 + 3
  }

  return value / 30 < 3 ? 3 : value / 30
}

function calculateReinforcement(
  base: number,
  reinforcement: number,
  calculateAsFloat: boolean,
): number {
  const result = (base * reinforcement) / 100
  return calculateAsFloat ? result : Math.trunc(result)
}

export function getWattReinforcement(
  watt: number,
  reinforcement: number,
  calculateAsFloat: boolean,
): number {
  return calculateReinforcement(
    getWattBase(watt),
    reinforcement,
    calculateAsFloat,
  )
}

export function getHealthReinforcement(
  value: number,
  reinforcement: number,
  isBody: boolean,
  calculateAsFloat: boolean,
): number {
  return calculateReinforcement(
    getHealthBase(value, isBody),
    reinforcement,
    calculateAsFloat,
  )
}

export function getDamageReinforcement(
  value: number,
  reinforcement: number,
  isWeapon: boolean,
  calculateAsFloat: boolean,
): number {
  return calculateReinforcement(
    getDamageBase(value, isWeapon),
    reinforcement,
    calculateAsFloat,
  )
}
