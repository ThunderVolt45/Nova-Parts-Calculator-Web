export function getAttackDefenseBase(watt: number): number {
  const increase = Math.trunc(3 + watt / 200)
  return Math.min(10, increase)
}

export function getTeamDual(watt: number, players: number): number {
  const increase = Math.trunc(1 + watt / 300)
  const boundedPlayers = Math.max(0, Math.min(12, players))
  return Math.min(5, increase) * boundedPlayers
}
