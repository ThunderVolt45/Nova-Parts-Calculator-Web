import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import './App.css'
import { partsCatalog, partsCatalogById } from './data/catalog/catalog.ts'
import { DeckPanel } from './deck/DeckPanel.tsx'
import type { Part, PartSlot } from './domain/catalog/schema.ts'
import { getArmorPierceBreakdown } from './domain/calculation/armorPierce.ts'
import { calculateBaseStats } from './domain/calculation/calculateBaseStats.ts'
import { calculateFinalStats } from './domain/calculation/calculateFinalStats.ts'
import {
  getDamageReinforcement,
  getHealthReinforcement,
  getWattReinforcement,
} from './domain/calculation/reinforcement.ts'
import type {
  AssemblyPartIds,
  BaseCalculationInput,
  PartReinforcement,
} from './domain/calculation/schema.ts'
import {
  emptySimulationInput,
  type SimulationInput,
} from './domain/calculation/simulationSchema.ts'
import { collectAssemblyAbilities } from './domain/calculation/specialAbilities.ts'
import {
  assemblyValidationIssueMessages,
  assemblyValidationMessages,
  validateAssembly,
} from './domain/calculation/validateAssembly.ts'
import type { SavedUnit } from './domain/deck/schema.ts'
import { LocalResourceConnector } from './gx/LocalResourceConnector.tsx'
import { LabUiSprite, LabUiSpriteProvider } from './gx/LabUiSprites.tsx'
import {
  getMountSpriteKey,
  getSubcoreSpriteKey,
} from './gx/lab-ui-atlas.ts'
import type { LocalResourceIndex } from './gx/local-files.ts'
import {
  StandalonePartViewer,
  type ViewerDisplayState,
} from './viewer/StandalonePartViewer.tsx'
import { AssembledUnitViewer } from './viewer/AssembledUnitViewer.tsx'
import {
  createViewerCameraStore,
  type ViewerCameraStore,
} from './viewer/camera-state.ts'
import { PartModelThumbnail } from './viewer/ModelThumbnail.tsx'
import { getViewerResourceLabel } from './viewer/viewer-hud.ts'
import {
  UNIT_ANIMATION_CLIPS,
  type UnitAnimationClip,
  type UnitAnimationPlayback,
} from './viewer/unit-animation.ts'

type EditablePartSlot = PartSlot | 'accessory'
type MobileView = 'assembly' | 'simulation' | 'stats' | 'deck'
type CenterMode = 'assembly' | 'simulation'
type BooleanSkillKey =
  | 'attackBase'
  | 'defenseBase'
  | 'groundAirAttack'
  | 'groundAirSpeed'
  | 'groundAirCooldown'
  | 'despera'
  | 'devilSpirit'
  | 'groundAirDefense'
  | 'groundAirSight'
  | 'morale'
type NumericSkillKey =
  | 'teamDualPlayers'
  | 'teamAttackPlayers'
  | 'teamDefensePlayers'
  | 'sacrifyWatt'
type ActiveReinforcement = {
  slot: PartSlot
  key: keyof PartReinforcement
} | null
type AccessoryRandomOptions = BaseCalculationInput['accessoryRandomOptions']
type CatalogPicker =
  | { kind: 'part'; slot: EditablePartSlot }
  | { kind: 'subcore'; slot: PartSlot }
type PartCatalogFilter =
  | 'all'
  | 'npart'
  | 'ground'
  | 'air'
  | 'tower'
  | 'arm'
  | 'shoulder'

const slotLabels: Record<EditablePartSlot, string> = {
  leg: '다리',
  body: '몸통',
  weapon: '무기',
  accessory: '액세서리',
}

const animationClipLabels: Record<UnitAnimationClip, string> = {
  idle: 'Idle',
  move: 'Move',
  attack: 'Attack',
}

const VIEWER_HELP_DURATION_MS = 4_500

function formatRotation(value: number, signed = false) {
  return `${signed && value > 0 ? '+' : ''}${value}°`
}

function ViewerCameraReadout({ store }: { readonly store: ViewerCameraStore }) {
  const camera = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )

  return (
    <div className="stage-readout stage-readout-left" aria-hidden="true">
      <span>
        ROTATE H {camera ? formatRotation(camera.azimuthDegrees, true) : '--'}
        {' '}· V {camera ? formatRotation(camera.polarDegrees) : '--'}
      </span>
      <span>ZOOM {camera ? `${camera.zoom.toFixed(2)}×` : '--'}</span>
    </div>
  )
}

const slotMarks: Record<EditablePartSlot, string> = {
  leg: 'L',
  body: 'B',
  weapon: 'W',
  accessory: 'A',
}

const mountLabels = {
  tower: '탑형',
  arm: '팔형',
  shoulder: '어깨형',
} as const

const mountFallbackLabels = {
  tower: '탑',
  arm: '팔',
  shoulder: '어깨',
} as const

const subcoreFallbackLabels: Readonly<Record<number, string>> = {
  1: 'Ar',
  2: 'Ta',
  3: 'Ge',
  4: 'Ca',
  5: 'Le',
  6: 'Vi',
  7: 'Li',
  8: 'Sc',
  9: 'Sa',
  10: 'Cp',
  11: 'Aq',
  12: 'Pi',
}

const reinforcementLabels: Array<{
  key: keyof PartReinforcement
  label: string
}> = [
  { key: 'watt', label: '와트' },
  { key: 'health', label: '체력' },
  { key: 'damage', label: '공격' },
]

const statusControls: Array<{
  key: keyof SimulationInput['statuses']
  label: string
}> = [
  { key: 'bodyLowHealthEffect', label: '몸통 저체력 효과' },
  { key: 'weaponEffect', label: '무기 특수 효과' },
  { key: 'towering', label: '타워링' },
  { key: 'deathmatch', label: '데스매치' },
]

const skillControls: Array<{ key: BooleanSkillKey; label: string }> = [
  { key: 'attackBase', label: '공격 기본' },
  { key: 'defenseBase', label: '방어 기본' },
  { key: 'groundAirAttack', label: '지상/공중 공격' },
  { key: 'groundAirDefense', label: '지상/공중 방어' },
  { key: 'groundAirSpeed', label: '지상/공중 속도' },
  { key: 'groundAirCooldown', label: '지상/공중 연사' },
  { key: 'groundAirSight', label: '지상/공중 시야' },
  { key: 'despera', label: '지상/공중 데스페라' },
  { key: 'devilSpirit', label: '데블스피릿' },
  { key: 'morale', label: '모랄' },
]

const teamControls: Array<{
  key: NumericSkillKey
  label: string
  max: number
}> = [
  { key: 'teamDualPlayers', label: '팀 듀얼 인원', max: 12 },
  { key: 'teamAttackPlayers', label: '팀 공격 인원', max: 12 },
  { key: 'teamDefensePlayers', label: '팀 방어 인원', max: 12 },
  { key: 'sacrifyWatt', label: '새크리파이 와트', max: 2500 },
]

const formationControls: Array<{
  key: keyof SimulationInput['squareFormation']
  label: string
}> = [
  { key: 'damageUnits', label: '공격 아이템' },
  { key: 'speedUnits', label: '속도 아이템' },
  { key: 'cooldownUnits', label: '연사 아이템' },
]

const defaultPartIds = (() => {
  const body = partsCatalog.parts.bodies.find((part) => part.id !== 0)
  const weapon = partsCatalog.parts.weapons.find(
    (part) => part.id !== 0 && part.mountType === body?.mountType,
  )
  const requiredLoad = (body?.weight ?? 0) + (weapon?.weight ?? 0)
  const leg =
    partsCatalog.parts.legs.find(
      (part) => part.id !== 0 && part.loadCapacity >= requiredLoad,
    ) ?? partsCatalog.parts.legs.find((part) => part.id !== 0)

  return {
    leg: leg?.id ?? 0,
    body: body?.id ?? 0,
    weapon: weapon?.id ?? 0,
    accessory: partsCatalog.parts.accessories[0]?.id ?? 0,
  } satisfies AssemblyPartIds
})()

const defaultReinforcement: Record<PartSlot, PartReinforcement> = {
  leg: { watt: 30, health: 20, damage: 10 },
  body: { watt: 25, health: 35, damage: 10 },
  weapon: { watt: 20, health: 10, damage: 40 },
}

const defaultSubcoreId = partsCatalog.subcores[0]?.id ?? 0
const defaultSubcoreIds: Record<PartSlot, number> = {
  leg: defaultSubcoreId,
  body: defaultSubcoreId,
  weapon: defaultSubcoreId,
}

const defaultAccessoryRandomOptions: AccessoryRandomOptions = {
  health: 0,
  damage: 0,
  armor: 0,
}

const emptyPartIds: AssemblyPartIds = {
  leg: 0,
  body: 0,
  weapon: 0,
  accessory: 0,
}

const emptyReinforcement: Record<PartSlot, PartReinforcement> = {
  leg: { watt: 0, health: 0, damage: 0 },
  body: { watt: 0, health: 0, damage: 0 },
  weapon: { watt: 0, health: 0, damage: 0 },
}

const airLegIds = new Set([6, 7, 12, 16, 22, 23, 30, 33])

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(value)
}

function formatSignedNumber(value: number) {
  const sign = value >= 0 ? '+' : '−'
  return `${sign} ${formatNumber(Math.abs(value))}`
}

function getPartReinforcementBonus(
  slot: PartSlot,
  key: keyof PartReinforcement,
  part: Part,
  value: number,
  calculateAsFloat: boolean,
) {
  if (key === 'watt') {
    return -getWattReinforcement(part.stats.watt, value, calculateAsFloat)
  }

  if (key === 'health') {
    return getHealthReinforcement(
      slot === 'body' ? part.stats.health : part.stats.watt,
      value,
      slot === 'body',
      calculateAsFloat,
    )
  }

  return getDamageReinforcement(
    slot === 'weapon' ? part.stats.damage : part.stats.watt,
    value,
    slot === 'weapon',
    calculateAsFloat,
  )
}

function getPartOptionLabels(part: Part) {
  const labels: Array<{ text: string; emphasized?: boolean }> = []
  const add = (label: string, value: number, suffix = '') => {
    if (value !== 0) {
      labels.push({ text: `${label} ${value > 0 ? '+' : ''}${value}${suffix}` })
    }
  }

  if ('loadCapacity' in part) {
    labels.push({ text: `하중 ${part.loadCapacity}`, emphasized: true })
  }
  if ('weight' in part) {
    labels.push({ text: `무게 ${part.weight}`, emphasized: true })
  }
  add('방어', part.stats.armor)
  add('속도', part.stats.speed)
  add('체력', part.stats.healthPercent, '%')
  add('공격', part.stats.damagePercent, '%')
  add('와트', part.stats.wattPercent, '%')
  add('연사', part.stats.cooldown)
  add('사거리', part.stats.range)
  add('최소 사거리', part.stats.minimumRange)
  add('시야', part.stats.sight)
  add('리젠', part.stats.regenerationPercent, '%')
  add('체력 비례 피해', part.stats.damagePerHealthPercent, '%')
  add('방어 무시', part.stats.armorPierce)

  return labels
}

function getCatalogSummarySpecs(part: Part) {
  return getPartOptionLabels(part).slice(0, 3)
}

function getPartsForSlot(slot: EditablePartSlot): ReadonlyArray<Part> {
  if (slot === 'leg') return partsCatalog.parts.legs
  if (slot === 'body') return partsCatalog.parts.bodies
  if (slot === 'weapon') return partsCatalog.parts.weapons
  return partsCatalog.parts.accessories
}

function getPartDisplayName(part: Part | undefined) {
  if (!part) return '부품 없음'
  return part.id === 0 ? '부품 없음' : part.name
}

function filterCatalogParts(
  items: ReadonlyArray<Part>,
  query: string,
  filter: PartCatalogFilter,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR')

  return items.filter((part) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      getPartDisplayName(part).toLocaleLowerCase('ko-KR').includes(normalizedQuery)
    const matchesFilter =
      filter === 'all' ||
      part.id === 0 ||
      (filter === 'npart'
        ? part.isNPart
        : filter === 'ground' || filter === 'air'
          ? part.kind === 'leg' && airLegIds.has(part.id) === (filter === 'air')
          : 'mountType' in part && part.mountType === filter)

    return matchesQuery && matchesFilter
  })
}

function getSubcoreOptionLabels(subcoreId: number, slot: PartSlot) {
  const subcore = partsCatalogById.subcores.get(subcoreId)
  if (!subcore) return []

  const stats = subcore.modifiersBySlot[slot]
  const labels: string[] = []
  const add = (label: string, value: number, suffix = '') => {
    if (value !== 0) {
      labels.push(`${label} ${value > 0 ? '+' : ''}${value}${suffix}`)
    }
  }

  add('와트', stats.watt)
  add('와트', stats.wattPercent, '%')
  add('체력', stats.health)
  add('체력', stats.healthPercent, '%')
  add('공격', stats.damage)
  add('공격', stats.damagePercent, '%')
  add('방어', stats.armor)
  add('속도', stats.speed)
  add('연사', stats.cooldown)
  add('사거리', stats.range)
  add('최소 사거리', stats.minimumRange)
  add('시야', stats.sight)
  add('리젠', stats.regenerationPercent, '%')
  add('체력 비례 피해', stats.damagePerHealthPercent, '%')
  add('방어 무시', stats.armorPierce)
  add('스플래시', stats.splashRadius)

  return labels
}

function clampInteger(value: number, max: number) {
  return Math.min(max, Math.max(0, Number.isFinite(value) ? Math.trunc(value) : 0))
}

function countActiveSimulationConditions(simulation: SimulationInput) {
  const statusCount = Object.values(simulation.statuses).filter(Boolean).length
  const skillCount = Object.values(simulation.skills).filter(
    (value) => value === true || (typeof value === 'number' && value > 0),
  ).length
  const squareItemCount = Object.values(simulation.squareFormation).filter(
    (value) => value > 0,
  ).length

  return statusCount + skillCount + squareItemCount
}

function App() {
  const [partIds, setPartIds] = useState<AssemblyPartIds>(emptyPartIds)
  const [reinforcement, setReinforcement] = useState(emptyReinforcement)
  const [subcoreIds, setSubcoreIds] = useState(defaultSubcoreIds)
  const [accessoryRandomOptions, setAccessoryRandomOptions] = useState(
    defaultAccessoryRandomOptions,
  )
  const [activePart, setActivePart] = useState<EditablePartSlot>('weapon')
  const [activeReinforcement, setActiveReinforcement] =
    useState<ActiveReinforcement>(null)
  const [catalogPicker, setCatalogPicker] = useState<CatalogPicker | null>(null)
  const [mobileView, setMobileView] = useState<MobileView>('assembly')
  const [calculateAsFloat, setCalculateAsFloat] = useState(false)
  const [centerMode, setCenterMode] = useState<CenterMode>('assembly')
  const [gxFileIndex, setGxFileIndex] = useState<LocalResourceIndex | null>(null)
  const [viewerResetToken, setViewerResetToken] = useState(0)
  const [viewerDisplay, setViewerDisplay] = useState<ViewerDisplayState>({
    status: 'offline',
    message: '게임 리소스 폴더를 연결하면 조립 유닛을 표시합니다.',
  })
  const [viewerHelpVisible, setViewerHelpVisible] = useState(false)
  const viewerCameraStore = useMemo(() => createViewerCameraStore(), [])
  const [unitAnimation, setUnitAnimation] = useState<UnitAnimationPlayback>({
    clip: 'idle',
    playing: false,
    restartToken: 0,
  })
  const [availableAnimationClips, setAvailableAnimationClips] = useState<
    readonly UnitAnimationClip[]
  >([])
  const [simulation, setSimulation] =
    useState<SimulationInput>(emptySimulationInput)

  const handleViewerStateChange = useCallback((state: ViewerDisplayState) => {
    setViewerDisplay(state)
    if (state.status !== 'ready') viewerCameraStore.reset()
  }, [viewerCameraStore])

  useEffect(() => {
    if (viewerDisplay.status !== 'ready') {
      setViewerHelpVisible(false)
      return
    }
    setViewerHelpVisible(true)
    const timeout = window.setTimeout(
      () => setViewerHelpVisible(false),
      VIEWER_HELP_DURATION_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [viewerDisplay.status])

  const validation = useMemo(
    () => validateAssembly(partIds, partsCatalogById),
    [partIds],
  )
  const activeSimulationConditionCount = useMemo(
    () => countActiveSimulationConditions(simulation),
    [simulation],
  )
  const handleAnimationClipsChange = useCallback((clips: readonly UnitAnimationClip[]) => {
    setAvailableAnimationClips((current) =>
      current.length === clips.length && current.every((clip, index) => clip === clips[index])
        ? current
        : [...clips],
    )
    setUnitAnimation((current) => {
      if (clips.length === 0) {
        return current.playing ? { ...current, playing: false } : current
      }
      const clip = clips.includes(current.clip)
        ? current.clip
        : clips.includes('idle')
          ? 'idle'
          : clips[0]
      return {
        clip,
        playing: true,
        restartToken: current.restartToken + 1,
      }
    })
  }, [])
  const baseInput = useMemo<BaseCalculationInput>(
    () => ({
      partIds,
      subcoreIds,
      reinforcement,
      accessoryRandomOptions,
      calculateAsFloat,
    }),
    [accessoryRandomOptions, calculateAsFloat, partIds, reinforcement, subcoreIds],
  )
  const stats = useMemo(
    () => calculateBaseStats(baseInput, partsCatalogById),
    [baseInput],
  )
  const finalStats = useMemo(
    () => calculateFinalStats(stats, baseInput, simulation, partsCatalogById),
    [baseInput, simulation, stats],
  )
  const defaultFinalStats = useMemo(
    () =>
      calculateFinalStats(
        stats,
        baseInput,
        emptySimulationInput,
        partsCatalogById,
      ),
    [baseInput, stats],
  )
  const isSimulationMode = centerMode === 'simulation'
  const displayedHealth = isSimulationMode
    ? defaultFinalStats.health
    : stats.health
  const displayedDamage = isSimulationMode
    ? defaultFinalStats.damage
    : stats.damage
  const displayedArmor = isSimulationMode
    ? defaultFinalStats.armor
    : stats.armor
  const displayedSpeed = isSimulationMode
    ? defaultFinalStats.speed
    : stats.speed
  const displayedCooldown = isSimulationMode
    ? defaultFinalStats.cooldown
    : stats.cooldown
  const displayedRange = isSimulationMode
    ? defaultFinalStats.range
    : stats.range
  const displayedMinimumRange = isSimulationMode
    ? defaultFinalStats.minimumRange
    : stats.minimumRange
  const displayedSight = isSimulationMode
    ? defaultFinalStats.sight
    : stats.sight
  const displayedRegeneration = defaultFinalStats.regenerationAmount
  const healthAdditive = isSimulationMode
    ? finalStats.health - defaultFinalStats.health
    : undefined
  const damageAdditive =
    isSimulationMode &&
    finalStats.damage !== null &&
    defaultFinalStats.damage !== null
      ? finalStats.damage - defaultFinalStats.damage
      : undefined
  const armorAdditive = isSimulationMode
    ? finalStats.armor - defaultFinalStats.armor
    : undefined
  const speedAdditive = isSimulationMode
    ? finalStats.speed - defaultFinalStats.speed
    : undefined
  const cooldownAdditive = isSimulationMode
    ? finalStats.cooldown - defaultFinalStats.cooldown
    : undefined
  const rangeAdditive = isSimulationMode
    ? finalStats.range - defaultFinalStats.range
    : undefined
  const sightAdditive = isSimulationMode
    ? finalStats.sight - defaultFinalStats.sight
    : undefined
  const regenerationAdditive = isSimulationMode
    ? finalStats.regenerationAmount - defaultFinalStats.regenerationAmount
    : undefined

  const selectedParts = {
    leg: partsCatalogById.legs.get(partIds.leg),
    body: partsCatalogById.bodies.get(partIds.body),
    weapon: partsCatalogById.weapons.get(partIds.weapon),
    accessory: partsCatalogById.accessories.get(partIds.accessory),
  }
  const assemblyAbilities = collectAssemblyAbilities(selectedParts)
  const armorPierceBreakdown = selectedParts.weapon
    ? getArmorPierceBreakdown(selectedParts.weapon, stats.armorPierce)
    : { flat: stats.armorPierce, percent: null }
  const armorPierceDisplay = [
    armorPierceBreakdown.percent === null
      ? null
      : `${formatNumber(armorPierceBreakdown.percent)}%`,
    armorPierceBreakdown.flat !== 0 || armorPierceBreakdown.percent === null
      ? formatNumber(armorPierceBreakdown.flat)
      : null,
  ]
    .filter((value) => value !== null)
    .join(' + ')
  const hasArmorPierce =
    armorPierceBreakdown.percent !== null || armorPierceBreakdown.flat !== 0
  const weightPercent = Math.min(
    100,
    stats.loadCapacity > 0 ? (stats.usedWeight / stats.loadCapacity) * 100 : 0,
  )

  const updatePart = (slot: EditablePartSlot, id: number) => {
    setPartIds((current) => ({ ...current, [slot]: id }))
    if (slot === 'accessory' && id !== partIds.accessory) {
      setAccessoryRandomOptions(defaultAccessoryRandomOptions)
    }
    setActivePart(slot)
    setActiveReinforcement(null)
  }

  const updateReinforcement = (
    slot: PartSlot,
    key: keyof PartReinforcement,
    value: number,
  ) => {
    setReinforcement((current) => ({
      ...current,
      [slot]: { ...current[slot], [key]: value },
    }))
  }

  const updateSubcore = (slot: PartSlot, id: number) => {
    setSubcoreIds((current) => ({ ...current, [slot]: id }))
    setActivePart(slot)
  }

  const updateAccessoryRandomOption = (
    key: keyof AccessoryRandomOptions,
    value: number,
    max: number,
  ) => {
    setAccessoryRandomOptions((current) => ({
      ...current,
      [key]: clampInteger(value, max),
    }))
  }

  const updateSimulationStatus = (
    key: keyof SimulationInput['statuses'],
    checked: boolean,
  ) => {
    setSimulation((current) => ({
      ...current,
      statuses: { ...current.statuses, [key]: checked },
    }))
  }

  const updateSimulationSkill = (key: BooleanSkillKey, checked: boolean) => {
    setSimulation((current) => ({
      ...current,
      skills: { ...current.skills, [key]: checked },
    }))
  }

  const updateSimulationNumber = (
    key: NumericSkillKey,
    value: number,
    max: number,
  ) => {
    setSimulation((current) => ({
      ...current,
      skills: {
        ...current.skills,
        [key]: Math.min(max, Math.max(0, Math.trunc(value))),
      },
    }))
  }

  const updateFormation = (
    key: keyof SimulationInput['squareFormation'],
    value: number,
  ) => {
    setSimulation((current) => ({
      ...current,
      squareFormation: {
        ...current.squareFormation,
        [key]: Math.min(50, Math.max(0, Math.trunc(value))),
      },
    }))
  }

  const resetAssembly = () => {
    setPartIds(defaultPartIds)
    setReinforcement(defaultReinforcement)
    setSubcoreIds(defaultSubcoreIds)
    setAccessoryRandomOptions(defaultAccessoryRandomOptions)
    setActivePart('weapon')
    setActiveReinforcement(null)
    setCatalogPicker(null)
    setCalculateAsFloat(false)
  }

  const loadSavedUnit = (unit: SavedUnit) => {
    setPartIds(unit.partIds)
    setReinforcement(unit.reinforcement)
    setSubcoreIds(unit.subcoreIds)
    setAccessoryRandomOptions(unit.accessoryRandomOptions)
    setCalculateAsFloat(false)
    setActivePart('weapon')
    setActiveReinforcement(null)
    setCatalogPicker(null)
    setMobileView('assembly')
  }

  const clearAssemblyForEmptyDeckSlot = () => {
    setPartIds(emptyPartIds)
    setReinforcement(emptyReinforcement)
    setSubcoreIds(defaultSubcoreIds)
    setAccessoryRandomOptions(defaultAccessoryRandomOptions)
    setCalculateAsFloat(false)
    setActivePart('weapon')
    setActiveReinforcement(null)
    setCatalogPicker(null)
    setMobileView('assembly')
  }

  return (
    <LabUiSpriteProvider index={gxFileIndex}>
      <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#main" aria-label="노바 어셈블리 홈">
          <span className="brand-mark" aria-hidden="true">
            N
          </span>
          <span>
            <strong>NOVA ASSEMBLY</strong>
            <small>1492 PARTS LAB</small>
          </span>
        </a>
      </header>

      <main id="main" className="workspace">
        <DeckPanel
          className={`mobile-panel ${mobileView === 'deck' ? 'is-mobile-active' : ''}`}
          currentUnit={{
            partIds,
            subcoreIds,
            reinforcement,
            accessoryRandomOptions,
          }}
          canRegisterUnit={validation.isValid}
          registrationIssues={validation.issues.map(
            (issue) => assemblyValidationIssueMessages[issue],
          )}
          onLoadUnit={loadSavedUnit}
          onClearUnit={clearAssemblyForEmptyDeckSlot}
          resourceIndex={gxFileIndex}
        />

        <section
          className={`panel builder-panel mobile-panel ${mobileView === 'assembly' ? 'is-mobile-active' : ''}`}
          aria-labelledby="builder-title"
        >
          <PanelHeader
            eyebrow="UNIT BUILD"
            title="부품 조립"
            id="builder-title"
            action={
              <button className="text-button" type="button" onClick={resetAssembly}>
                초기화
              </button>
            }
          />

          <p className="mobile-3d-notice">
            3D 미리보기는 PC에서 사용할 수 있습니다.
          </p>

          <div className="assembly-status-row">
            <span className={`status-pill ${validation.isValid ? 'is-valid' : 'is-error'}`}>
              <i aria-hidden="true" />
              {assemblyValidationMessages[validation.status]}
            </span>
            <span className="unit-code">UNIT-01</span>
          </div>

          <div className="part-list">
            <PartSelector
              slot="leg"
              active={activePart === 'leg'}
              invalid={validation.invalidPartSlots.includes('leg')}
              value={partIds.leg}
              items={partsCatalog.parts.legs}
              subcoreId={subcoreIds.leg}
              reinforcement={reinforcement.leg}
              activeReinforcementKey={
                activeReinforcement?.slot === 'leg' ? activeReinforcement.key : undefined
              }
              calculateAsFloat={calculateAsFloat}
              resourceIndex={gxFileIndex}
              onFocus={() => setActivePart('leg')}
              onOpenPartPicker={() => setCatalogPicker({ kind: 'part', slot: 'leg' })}
              onOpenSubcorePicker={() =>
                setCatalogPicker({ kind: 'subcore', slot: 'leg' })
              }
              onReinforcementSelect={(key) =>
                setActiveReinforcement((current) =>
                  current?.slot === 'leg' && current.key === key ? null : { slot: 'leg', key },
                )
              }
              onReinforcementChange={(key, value) =>
                updateReinforcement('leg', key, value)
              }
            />
            <PartSelector
              slot="body"
              active={activePart === 'body'}
              invalid={validation.invalidPartSlots.includes('body')}
              value={partIds.body}
              items={partsCatalog.parts.bodies}
              subcoreId={subcoreIds.body}
              reinforcement={reinforcement.body}
              activeReinforcementKey={
                activeReinforcement?.slot === 'body' ? activeReinforcement.key : undefined
              }
              calculateAsFloat={calculateAsFloat}
              resourceIndex={gxFileIndex}
              onFocus={() => setActivePart('body')}
              onOpenPartPicker={() => setCatalogPicker({ kind: 'part', slot: 'body' })}
              onOpenSubcorePicker={() =>
                setCatalogPicker({ kind: 'subcore', slot: 'body' })
              }
              onReinforcementSelect={(key) =>
                setActiveReinforcement((current) =>
                  current?.slot === 'body' && current.key === key
                    ? null
                    : { slot: 'body', key },
                )
              }
              onReinforcementChange={(key, value) =>
                updateReinforcement('body', key, value)
              }
            />
            <PartSelector
              slot="weapon"
              active={activePart === 'weapon'}
              invalid={validation.invalidPartSlots.includes('weapon')}
              value={partIds.weapon}
              items={partsCatalog.parts.weapons}
              subcoreId={subcoreIds.weapon}
              reinforcement={reinforcement.weapon}
              activeReinforcementKey={
                activeReinforcement?.slot === 'weapon'
                  ? activeReinforcement.key
                  : undefined
              }
              calculateAsFloat={calculateAsFloat}
              resourceIndex={gxFileIndex}
              onFocus={() => setActivePart('weapon')}
              onOpenPartPicker={() =>
                setCatalogPicker({ kind: 'part', slot: 'weapon' })
              }
              onOpenSubcorePicker={() =>
                setCatalogPicker({ kind: 'subcore', slot: 'weapon' })
              }
              onReinforcementSelect={(key) =>
                setActiveReinforcement((current) =>
                  current?.slot === 'weapon' && current.key === key
                    ? null
                    : { slot: 'weapon', key },
                )
              }
              onReinforcementChange={(key, value) =>
                updateReinforcement('weapon', key, value)
              }
            />
            <PartSelector
              slot="accessory"
              active={activePart === 'accessory'}
              invalid={validation.invalidPartSlots.includes('accessory')}
              value={partIds.accessory}
              items={partsCatalog.parts.accessories}
              accessoryRandomOptions={accessoryRandomOptions}
              resourceIndex={gxFileIndex}
              onFocus={() => setActivePart('accessory')}
              onOpenPartPicker={() =>
                setCatalogPicker({ kind: 'part', slot: 'accessory' })
              }
              onAccessoryRandomOptionChange={updateAccessoryRandomOption}
            />
          </div>
        </section>

        <section
          className={`viewer-panel mobile-panel ${mobileView === 'simulation' ? 'is-mobile-active' : ''}`}
          aria-labelledby="viewer-title"
        >
          <div className="viewer-toolbar">
            <div>
              <span className="micro-label">
                {isSimulationMode ? 'COMBAT LAB' : 'LIVE PREVIEW'}
              </span>
              <h2 id="viewer-title">
                {isSimulationMode
                  ? '전투 시뮬레이션'
                  : '조립 유닛 프리뷰'}
              </h2>
            </div>
            <div className="segmented-control center-mode-control" aria-label="중앙 화면 방식">
              <button
                className={centerMode === 'assembly' ? 'is-active' : ''}
                type="button"
                onClick={() => setCenterMode('assembly')}
              >
                유닛 프리뷰
              </button>
              <button
                className={centerMode === 'simulation' ? 'is-active' : ''}
                type="button"
                onClick={() => setCenterMode('simulation')}
              >
                시뮬레이션
              </button>
            </div>
          </div>

          {centerMode !== 'simulation' ? (
            <>
              <div className="model-stage">
                <div className="stage-grid" aria-hidden="true" />
                <ViewerCameraReadout store={viewerCameraStore} />
                <div className="stage-readout stage-readout-right" aria-hidden="true">
                  <span>{getViewerResourceLabel(gxFileIndex?.size ?? null, viewerDisplay)}</span>
                </div>
                <AssembledUnitViewer
                  parts={{
                    leg: {
                      id: partIds.leg,
                      name: selectedParts.leg?.name ?? '다리 없음',
                    },
                    body: {
                      id: partIds.body,
                      name: selectedParts.body?.name ?? '몸통 없음',
                    },
                    weapon: {
                      id: partIds.weapon,
                      name: selectedParts.weapon?.name ?? '무기 없음',
                    },
                  }}
                  index={gxFileIndex}
                  resetToken={viewerResetToken}
                  animation={unitAnimation}
                  onStateChange={handleViewerStateChange}
                  onAnimationClipsChange={handleAnimationClipsChange}
                  onCameraStateChange={viewerCameraStore.update}
                  onInteractionStart={() => setViewerHelpVisible(false)}
                />
                {viewerHelpVisible && (
                  <div className="viewer-interaction-help" role="status">
                    <strong>프리뷰 조작</strong>
                    <span>드래그하여 회전</span>
                    <span>휠로 확대·축소</span>
                  </div>
                )}
                <LocalResourceConnector
                  index={gxFileIndex}
                  onIndexChange={setGxFileIndex}
                  compact={viewerDisplay.status === 'ready'}
                />
              </div>

              <div className="viewer-footer">
                <div className="animation-control">
                  <button
                    className="play-button"
                    type="button"
                    aria-label={unitAnimation.playing
                      ? '애니메이션 일시정지'
                      : '애니메이션 재생'}
                    disabled={
                      viewerDisplay.status !== 'ready'
                      || !availableAnimationClips.includes(unitAnimation.clip)
                    }
                    onClick={() => setUnitAnimation((current) => ({
                      ...current,
                      playing: !current.playing,
                    }))}
                  >
                    <span aria-hidden="true">{unitAnimation.playing ? 'Ⅱ' : '▶'}</span>
                  </button>
                  <div>
                    <span>ANIMATION</span>
                    <strong>{animationClipLabels[unitAnimation.clip]}</strong>
                  </div>
                </div>
                <div className="animation-toolbar">
                  <div className="animation-clips" role="group" aria-label="애니메이션 클립 선택">
                    {UNIT_ANIMATION_CLIPS.map((clip) => (
                      <button
                        key={clip}
                        className={unitAnimation.clip === clip ? 'is-active' : ''}
                        type="button"
                        aria-pressed={unitAnimation.clip === clip}
                        disabled={
                          viewerDisplay.status !== 'ready'
                          || !availableAnimationClips.includes(clip)
                        }
                        onClick={() => setUnitAnimation((current) => ({
                          clip,
                          playing: true,
                          restartToken: current.restartToken + 1,
                        }))}
                      >
                        {animationClipLabels[clip]}
                      </button>
                    ))}
                  </div>
                  <button
                    className="animation-restart"
                    type="button"
                    disabled={
                      viewerDisplay.status !== 'ready'
                      || !availableAnimationClips.includes(unitAnimation.clip)
                    }
                    onClick={() => setUnitAnimation((current) => ({
                      ...current,
                      playing: true,
                      restartToken: current.restartToken + 1,
                    }))}
                  >
                    처음부터
                  </button>
                </div>
                <button
                  className="camera-button"
                  type="button"
                  disabled={viewerDisplay.status !== 'ready'}
                  onClick={() => setViewerResetToken((token) => token + 1)}
                >
                  카메라 초기화
                </button>
              </div>
            </>
          ) : (
            <div className="simulation-workspace">
              <div className="simulation-intro">
                <div>
                  <span className="micro-label">SESSION ONLY</span>
                  <strong>전투 조건을 조정해 최종 능력치를 비교하세요</strong>
                  <p>시뮬레이션 설정은 덱 유닛에 저장되지 않습니다.</p>
                </div>
                <div className="simulation-intro-actions">
                  <span
                    className={`simulation-active-count ${activeSimulationConditionCount > 0 ? 'is-active' : ''}`}
                    role="status"
                  >
                    {activeSimulationConditionCount > 0
                      ? `${activeSimulationConditionCount}개 적용 중`
                      : '적용 조건 없음'}
                  </span>
                  <button
                    className="simulation-reset"
                    type="button"
                    disabled={activeSimulationConditionCount === 0}
                    onClick={() => setSimulation(emptySimulationInput)}
                  >
                    조건 초기화
                  </button>
                </div>
              </div>

              <div className="simulation-grid">
                <section className="simulation-card simulation-card-status">
                  <SimulationCardHeader mark="01" title="전투 상태" subtitle="STATUS" />
                  <div className="simulation-toggle-grid">
                    {statusControls.map((control) => (
                      <SimulationToggle
                        key={control.key}
                        label={control.label}
                        checked={simulation.statuses[control.key]}
                        onChange={(checked) =>
                          updateSimulationStatus(control.key, checked)
                        }
                      />
                    ))}
                  </div>
                </section>

                <section className="simulation-card simulation-card-skills">
                  <SimulationCardHeader mark="02" title="전투 스킬" subtitle="SKILLS" />
                  <div className="simulation-toggle-grid simulation-toggle-grid-skills">
                    {skillControls.map((control) => (
                      <SimulationToggle
                        key={control.key}
                        label={control.label}
                        checked={simulation.skills[control.key]}
                        onChange={(checked) =>
                          updateSimulationSkill(control.key, checked)
                        }
                      />
                    ))}
                  </div>
                </section>

                <section className="simulation-card simulation-card-team">
                  <SimulationCardHeader mark="03" title="팀 효과" subtitle="TEAM" />
                  <div className="simulation-number-list">
                    {teamControls.map((control) => (
                      <SimulationNumberField
                        key={control.key}
                        label={control.label}
                        value={simulation.skills[control.key]}
                        max={control.max}
                        onChange={(value) =>
                          updateSimulationNumber(control.key, value, control.max)
                        }
                      />
                    ))}
                  </div>
                </section>

                <section className="simulation-card simulation-card-formation">
                  <SimulationCardHeader
                    mark="04"
                    title="스퀘어 아이템 효과"
                    subtitle="SQUARE ITEM"
                  />
                  <div className="simulation-number-list">
                    {formationControls.map((control) => (
                      <SimulationNumberField
                        key={control.key}
                        label={control.label}
                        value={simulation.squareFormation[control.key]}
                        max={50}
                        onChange={(value) => updateFormation(control.key, value)}
                      />
                    ))}
                  </div>
                  <div className="simulation-result-note">
                    <i aria-hidden="true" /> 우측 능력치에 최종 결과가 실시간 반영됩니다.
                  </div>
                </section>
              </div>
            </div>
          )}
        </section>

        <aside
          className={`panel stats-panel mobile-panel ${mobileView === 'stats' ? 'is-mobile-active' : ''}`}
          aria-labelledby="stats-title"
        >
          <PanelHeader
            eyebrow="CALCULATION"
            title="능력치"
            id="stats-title"
            action={
              <div className="stats-header-actions">
                <span
                  className={`result-mode-badge ${isSimulationMode ? 'is-final' : 'is-base'}`}
                  aria-label={isSimulationMode ? '시뮬레이션 최종 능력치' : '기본 능력치'}
                >
                  {isSimulationMode ? 'FINAL' : 'BASE'}
                </span>
                <label className="mode-switch">
                  <input
                    type="checkbox"
                    checked={calculateAsFloat}
                    onChange={(event) => setCalculateAsFloat(event.target.checked)}
                  />
                  <span aria-hidden="true" />
                  실수 계산
                </label>
              </div>
            }
          />

          <div className="weight-card">
            <div className="weight-copy">
              <span>하중</span>
              <strong className={validation.weightInvalid ? 'danger-text' : ''}>
                {formatNumber(stats.usedWeight)}
                <small> / {formatNumber(stats.loadCapacity)}</small>
              </strong>
            </div>
            <div className="meter" aria-label={`하중 사용률 ${Math.round(weightPercent)}%`}>
              <i
                className={validation.weightInvalid ? 'is-over' : ''}
                style={{ width: `${weightPercent}%` }}
              />
            </div>
            <span className="weight-remaining">
              잔여 {formatNumber(Math.max(0, stats.loadCapacity - stats.usedWeight))}
            </span>
          </div>

          <div className="primary-stats">
            {stats.watt !== 0 && (
              <PrimaryStat label="와트" value={stats.watt} mark="W" tone="cyan" />
            )}
            {(displayedHealth !== 0 || (healthAdditive ?? 0) !== 0) && (
              <PrimaryStat
                label="체력"
                value={displayedHealth}
                additive={healthAdditive}
                mark="H"
                tone="green"
              />
            )}
            {(displayedDamage !== 0 || (damageAdditive ?? 0) !== 0) && (
              <PrimaryStat
                label="공격력"
                value={displayedDamage ?? '없음'}
                additive={damageAdditive}
                mark="D"
                tone="orange"
              />
            )}
          </div>

          <div className="secondary-stats">
            {(displayedArmor !== 0 || (armorAdditive ?? 0) !== 0) && (
              <StatRow label="방어력" value={displayedArmor} additive={armorAdditive} />
            )}
            {(displayedSpeed !== 0 || (speedAdditive ?? 0) !== 0) && (
              <StatRow label="속도" value={displayedSpeed} additive={speedAdditive} />
            )}
            {(displayedCooldown !== 0 || (cooldownAdditive ?? 0) !== 0) && (
              <StatRow
                label="연사"
                value={displayedCooldown}
                additive={cooldownAdditive}
                hint="100 = 1초"
              />
            )}
            {(displayedRange !== 0 || (rangeAdditive ?? 0) !== 0) && (
              <StatRow label="사거리" value={displayedRange} additive={rangeAdditive} />
            )}
            {displayedMinimumRange !== 0 && (
              <StatRow label="최소 사거리" value={displayedMinimumRange} />
            )}
            {stats.splashRadius !== 0 && (
              <StatRow label="스플래시 범위" value={stats.splashRadius} />
            )}
            {(displayedSight !== 0 || (sightAdditive ?? 0) !== 0) && (
              <StatRow label="시야" value={displayedSight} additive={sightAdditive} />
            )}
            {hasArmorPierce && <StatRow label="방어 무시" value={armorPierceDisplay} />}
            {(displayedRegeneration !== 0 || (regenerationAdditive ?? 0) !== 0) && (
              <StatRow
                label="리젠량"
                value={displayedRegeneration}
                additive={regenerationAdditive}
                hint="5초 당"
              />
            )}
          </div>

          <div className="abilities-panel">
            <div className="abilities-heading">
              <span className="micro-label">SPECIAL ABILITIES</span>
              <strong>유닛 특수 능력</strong>
            </div>

            {assemblyAbilities.passives.map((ability) => (
              <article className="ability-item ability-item-passive" key={ability.slot}>
                <span className="ability-type-mark" aria-hidden="true">
                  P
                </span>
                <div>
                  <div className="ability-item-title">
                    <span>패시브 · {slotLabels[ability.slot]}</span>
                    <strong>{ability.partName}</strong>
                  </div>
                  <p>{ability.text}</p>
                </div>
              </article>
            ))}

            {assemblyAbilities.active && (
              <article className="ability-item ability-item-active">
                <span className="ability-type-mark" aria-hidden="true">
                  C
                </span>
                <div>
                  <div className="ability-item-title">
                    <span>액티브 · {slotLabels[assemblyAbilities.active.slot]}</span>
                    <strong>{assemblyAbilities.active.partName}</strong>
                  </div>
                  <p>{assemblyAbilities.active.text}</p>
                </div>
              </article>
            )}

            {assemblyAbilities.passives.length === 0 && !assemblyAbilities.active && (
              <p className="ability-empty">장착된 부품에 특수 능력이 없습니다.</p>
            )}
          </div>

          {!validation.isValid && (
            <div className="validation-message" role="alert">
              <div>
                <strong>조립 불가</strong>
                <span>{validation.issues.length}개의 조건을 확인해 주세요.</span>
              </div>
              <ul>
                {validation.issues.map((issue) => (
                  <li key={issue}>{assemblyValidationIssueMessages[issue]}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>

      </main>

      <nav className="mobile-nav" aria-label="모바일 화면 전환">
        <MobileNavButton
          label="조립"
          mark="B"
          active={mobileView === 'assembly'}
          onClick={() => setMobileView('assembly')}
        />
        <MobileNavButton
          label="시뮬레이션"
          mark="C"
          active={mobileView === 'simulation'}
          onClick={() => {
            setCenterMode('simulation')
            setMobileView('simulation')
          }}
        />
        <MobileNavButton
          label="능력치"
          mark="S"
          active={mobileView === 'stats'}
          onClick={() => setMobileView('stats')}
        />
        <MobileNavButton
          label="덱"
          mark="D"
          active={mobileView === 'deck'}
          onClick={() => setMobileView('deck')}
        />
      </nav>

      {catalogPicker?.kind === 'part' && (
        <PartCatalogDialog
          key={`part-${catalogPicker.slot}`}
          slot={catalogPicker.slot}
          value={partIds[catalogPicker.slot]}
          resourceIndex={gxFileIndex}
          onClose={() => setCatalogPicker(null)}
          onSelect={(id) => {
            updatePart(catalogPicker.slot, id)
            setCatalogPicker(null)
          }}
        />
      )}

      {catalogPicker?.kind === 'subcore' && (
        <SubcoreCatalogDialog
          key={`subcore-${catalogPicker.slot}`}
          slot={catalogPicker.slot}
          value={subcoreIds[catalogPicker.slot]}
          onClose={() => setCatalogPicker(null)}
          onSelect={(id) => {
            updateSubcore(catalogPicker.slot, id)
            setCatalogPicker(null)
          }}
        />
      )}
      </div>
    </LabUiSpriteProvider>
  )
}

function PanelHeader({
  eyebrow,
  title,
  id,
  action,
}: {
  eyebrow: string
  title: string
  id: string
  action: React.ReactNode
}) {
  return (
    <div className="panel-header">
      <div>
        <span className="micro-label">{eyebrow}</span>
        <h2 id={id}>{title}</h2>
      </div>
      {action}
    </div>
  )
}

function PartSelector<T extends Part>({
  slot,
  active,
  invalid = false,
  value,
  items,
  subcoreId,
  reinforcement,
  activeReinforcementKey,
  accessoryRandomOptions,
  calculateAsFloat = false,
  resourceIndex,
  onFocus,
  onOpenPartPicker,
  onOpenSubcorePicker,
  onReinforcementSelect,
  onReinforcementChange,
  onAccessoryRandomOptionChange,
}: {
  slot: EditablePartSlot
  active: boolean
  invalid?: boolean
  value: number
  items: ReadonlyArray<T>
  subcoreId?: number
  reinforcement?: PartReinforcement
  activeReinforcementKey?: keyof PartReinforcement
  accessoryRandomOptions?: AccessoryRandomOptions
  calculateAsFloat?: boolean
  resourceIndex: LocalResourceIndex | null
  onFocus: () => void
  onOpenPartPicker: () => void
  onOpenSubcorePicker?: () => void
  onReinforcementSelect?: (key: keyof PartReinforcement) => void
  onReinforcementChange?: (key: keyof PartReinforcement, value: number) => void
  onAccessoryRandomOptionChange?: (
    key: keyof AccessoryRandomOptions,
    value: number,
    max: number,
  ) => void
}) {
  const selected = items.find((item) => item.id === value)
  const selectedSubcore =
    subcoreId === undefined ? undefined : partsCatalogById.subcores.get(subcoreId)
  const selectedReinforcement = reinforcementLabels.find(
    ({ key }) => key === activeReinforcementKey,
  )
  const optionLabels = selected ? getPartOptionLabels(selected) : []
  const isExpanded =
    slot !== 'accessory' &&
    selected !== undefined &&
    reinforcement !== undefined &&
    selectedReinforcement !== undefined &&
    onReinforcementChange !== undefined

  return (
    <div
      className={`part-selector ${active ? 'is-active' : ''} ${invalid ? 'is-invalid' : ''} ${isExpanded ? 'is-expanded' : ''}`}
      aria-invalid={invalid || undefined}
    >
      <button
        className={`part-preview part-preview-${slot}`}
        type="button"
        onClick={onFocus}
        aria-label={`${slotLabels[slot]} 프리뷰 선택`}
      >
        <span className="part-grid" aria-hidden="true" />
        <PartModelThumbnail
          kind={slot}
          partId={selected?.id ?? 0}
          partName={getPartDisplayName(selected)}
          index={resourceIndex}
        />
        {selectedSubcore && selectedSubcore.id !== 0 && (
          <LabUiSprite
            className={`subcore-sprite subcore-sprite-${slot}`}
            spriteKey={getSubcoreSpriteKey(selectedSubcore.id)}
            label={`${selectedSubcore.name} 오버레이`}
            fallback={<span className="sprite-fallback-text">{subcoreFallbackLabels[selectedSubcore.id]}</span>}
          />
        )}
        {selected && 'mountType' in selected && selected.mountType !== 'none' && (
          <LabUiSprite
            className={`mount-sprite mount-sprite-${selected.mountType}`}
            spriteKey={getMountSpriteKey(selected.mountType)}
            label={mountLabels[selected.mountType]}
            fallback={<span className="sprite-fallback-text">{mountFallbackLabels[selected.mountType]}</span>}
          />
        )}
        <small>{slotMarks[slot]}</small>
      </button>

      <div className="part-details">
        <div className="part-card-label">
          <span>{slotLabels[slot]}</span>
          {invalid && <small className="part-error-label">확인 필요</small>}
        </div>
        <button
          className="part-select-trigger"
          type="button"
          onClick={() => {
            onFocus()
            onOpenPartPicker()
          }}
          aria-label={`${slotLabels[slot]} 부품 변경, 현재 ${getPartDisplayName(selected)}`}
        >
          <span>{getPartDisplayName(selected)}</span>
          <span aria-hidden="true">⌄</span>
        </button>
        <div className="part-stat-grid">
          {reinforcementLabels.map(({ key, label }) => (
            <PartCardStat
              key={key}
              label={label}
              value={selected?.stats[key] ?? 0}
              bonus={
                selected && reinforcement && slot !== 'accessory'
                  ? getPartReinforcementBonus(
                      slot,
                      key,
                      selected,
                      reinforcement[key],
                      calculateAsFloat,
                    )
                  : undefined
              }
              tone={key}
              active={activeReinforcementKey === key}
              onClick={
                reinforcement && onReinforcementSelect
                  ? () => {
                      onFocus()
                      onReinforcementSelect(key)
                    }
                  : undefined
              }
            />
          ))}
        </div>

        {optionLabels.length > 0 && (
          <div className="part-option-list" aria-label="부품 추가 옵션">
            {optionLabels.map((option) => (
              <span className={option.emphasized ? 'is-key-option' : ''} key={option.text}>
                {option.text}
              </span>
            ))}
          </div>
        )}

        {subcoreId !== undefined && onOpenSubcorePicker && (
          <button
            className="subcore-select-trigger"
            type="button"
            onClick={() => {
              onFocus()
              onOpenSubcorePicker()
            }}
            aria-label={`${slotLabels[slot]} 서브코어 변경, 현재 ${selectedSubcore?.name ?? '선택 없음'}`}
          >
            <span>
              <i aria-hidden="true" /> 서브코어
            </span>
            <strong>{selectedSubcore?.name ?? '선택 없음'}</strong>
            <b aria-hidden="true">⌄</b>
          </button>
        )}

        {selected?.kind === 'accessory' &&
          selected.hasRandomOptions &&
          accessoryRandomOptions &&
          onAccessoryRandomOptionChange && (
            <div className="accessory-random-options" aria-label="액세서리 랜덤 옵션">
              <span className="micro-label">RANDOM OPTIONS</span>
              <div>
                <RandomOptionInput
                  label="체력"
                  value={accessoryRandomOptions.health}
                  max={200}
                  onChange={(value) =>
                    onAccessoryRandomOptionChange('health', value, 200)
                  }
                />
                <RandomOptionInput
                  label="공격"
                  value={accessoryRandomOptions.damage}
                  max={20}
                  onChange={(value) =>
                    onAccessoryRandomOptionChange('damage', value, 20)
                  }
                />
                <RandomOptionInput
                  label="방어"
                  value={accessoryRandomOptions.armor}
                  max={10}
                  onChange={(value) =>
                    onAccessoryRandomOptionChange('armor', value, 10)
                  }
                />
              </div>
            </div>
        )}
      </div>

      {isExpanded && reinforcement && selectedReinforcement && onReinforcementChange && (
        <div className="inline-reinforcement">
          <div className="inline-reinforcement-heading">
            <span className="micro-label">INLINE ENHANCEMENT</span>
            <strong>
              {slotLabels[slot]} · {selectedReinforcement.label} 강화
            </strong>
          </div>
          <label className="inline-reinforcement-control">
            <span>강화 수치</span>
            <input
              type="range"
              min="0"
              max="100"
              value={reinforcement[selectedReinforcement.key]}
              onChange={(event) =>
                onReinforcementChange(
                  selectedReinforcement.key,
                  Number(event.target.value),
                )
              }
            />
            <input
              type="number"
              min="0"
              max="100"
              value={reinforcement[selectedReinforcement.key]}
              aria-label={`${selectedReinforcement.label} 강화 수치`}
              onChange={(event) =>
                onReinforcementChange(
                  selectedReinforcement.key,
                  Math.min(100, Math.max(0, Number(event.target.value))),
                )
              }
            />
          </label>
        </div>
      )}
    </div>
  )
}

function RandomOptionInput({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        min="0"
        max={max}
        value={value}
        aria-label={`액세서리 ${label} 랜덤 옵션`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <small>/ {max}</small>
    </label>
  )
}

function useCatalogDialog(
  onClose: () => void,
  initialFocusRef: React.RefObject<HTMLInputElement | null>,
) {
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    initialFocusRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [initialFocusRef, onClose])
}

function PartCatalogDialog({
  slot,
  value,
  resourceIndex,
  onClose,
  onSelect,
}: {
  slot: EditablePartSlot
  value: number
  resourceIndex: LocalResourceIndex | null
  onClose: () => void
  onSelect: (id: number) => void
}) {
  const items = getPartsForSlot(slot)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PartCatalogFilter>('all')
  const [highlightedId, setHighlightedId] = useState(value)
  const searchRef = useRef<HTMLInputElement>(null)
  const detailRef = useRef<HTMLElement>(null)
  useCatalogDialog(onClose, searchRef)

  const highlightPart = (partId: number) => {
    setHighlightedId(partId)
    if (window.matchMedia?.('(max-width: 1050px)').matches) {
      requestAnimationFrame(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  const filterChoices = useMemo(() => {
    const choices: Array<{ key: PartCatalogFilter; label: string }> = [
      { key: 'all', label: '전체' },
    ]

    if (slot === 'leg') {
      choices.push(
        { key: 'ground', label: '지상' },
        { key: 'air', label: '공중' },
      )
    }

    if (items.some((part) => part.isNPart)) {
      choices.push({ key: 'npart', label: 'N 부품' })
    }

    ;(['tower', 'arm', 'shoulder'] as const).forEach((mountType) => {
      if (items.some((part) => 'mountType' in part && part.mountType === mountType)) {
        choices.push({ key: mountType, label: mountLabels[mountType] })
      }
    })

    return choices
  }, [items, slot])
  const filteredItems = useMemo(
    () => filterCatalogParts(items, query, filter),
    [filter, items, query],
  )
  const highlighted =
    filteredItems.find((part) => part.id === highlightedId) ??
    filteredItems[0] ??
    items.find((part) => part.id === value)
  const optionLabels = highlighted ? getPartOptionLabels(highlighted) : []
  const attackTarget = highlighted
    ? [
        highlighted.attackTargets.ground ? '지상' : null,
        highlighted.attackTargets.air ? '공중' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <div
      className="catalog-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="catalog-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="part-catalog-title"
      >
        <header className="catalog-dialog-header">
          <div>
            <span className="micro-label">PARTS CATALOG</span>
            <h2 id="part-catalog-title">{slotLabels[slot]} 선택</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="부품 선택 닫기">
            <span className="catalog-close-icon" aria-hidden="true" />
          </button>
        </header>

        <div className="catalog-toolbar">
          <label className="catalog-search-field">
            <span aria-hidden="true">⌕</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="부품 이름 검색"
              aria-label={`${slotLabels[slot]} 부품 검색`}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')}>
                지우기
              </button>
            )}
          </label>
          <div className="catalog-filter-list" aria-label="부품 타입 필터">
            {filterChoices.map((choice) => (
              <button
                className={filter === choice.key ? 'is-active' : ''}
                type="button"
                key={choice.key}
                aria-pressed={filter === choice.key}
                onClick={() => setFilter(choice.key)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>

        <div className="catalog-dialog-body">
          <div className="catalog-results-panel">
            <div className="catalog-results-heading">
              <span>검색 결과</span>
              <small>{filteredItems.length}개</small>
            </div>
            <div className="catalog-result-list">
              {filteredItems.map((part) => {
                const displayName = getPartDisplayName(part)
                const mountLabel =
                  'mountType' in part && part.mountType !== 'none'
                    ? mountLabels[part.mountType]
                    : null
                const summarySpecs = getCatalogSummarySpecs(part)
                const primarySpecs = [
                  { key: 'watt', label: '와트', value: part.stats.watt },
                  { key: 'health', label: '체력', value: part.stats.health },
                  { key: 'damage', label: '공격력', value: part.stats.damage },
                ] as const
                const hasDenseSpecs = primarySpecs.length + summarySpecs.length >= 6

                return (
                  <button
                    className={`${highlighted?.id === part.id ? 'is-active' : ''} ${value === part.id ? 'is-equipped' : ''} ${hasDenseSpecs ? 'has-dense-specs' : ''}`}
                    type="button"
                    key={part.id}
                    onClick={() => highlightPart(part.id)}
                    aria-label={`${displayName}${value === part.id ? ', 현재 선택' : ''}`}
                  >
                    <span className="catalog-result-preview">
                      <CatalogPartThumbnail
                        kind={slot}
                        partId={part.id}
                        partName={displayName}
                        index={resourceIndex}
                      />
                    </span>
                    <span className="catalog-result-copy">
                      <strong>{displayName}</strong>
                      {(mountLabel || part.isNPart) && (
                        <small className="catalog-result-tags">
                          {[mountLabel, part.isNPart ? 'N 부품' : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      )}
                      <span className="catalog-result-specs">
                        {primarySpecs.map((spec) => (
                          <small className={`is-primary is-${spec.key}`} key={spec.key}>
                            {spec.label} {formatNumber(spec.value)}
                          </small>
                        ))}
                        {summarySpecs.length > 0 ? summarySpecs.map((spec) => (
                          <small className={spec.emphasized ? 'is-key-option' : ''} key={spec.text}>
                            {spec.text}
                          </small>
                        )) : null}
                      </span>
                    </span>
                  </button>
                )
              })}
              {filteredItems.length === 0 && (
                <div className="catalog-empty-result">
                  <strong>일치하는 부품이 없습니다</strong>
                  <span>검색어나 타입 필터를 변경해 주세요.</span>
                </div>
              )}
            </div>
          </div>

          <aside ref={detailRef} className="catalog-detail-panel" aria-live="polite">
            {highlighted ? (
              <>
                <div className="catalog-detail-preview">
                  <span className="part-grid" aria-hidden="true" />
                  <StandalonePartViewer
                    kind={slot}
                    partId={highlighted.id}
                    partName={getPartDisplayName(highlighted)}
                    index={resourceIndex}
                    resetToken={0}
                  />
                  {'mountType' in highlighted && highlighted.mountType !== 'none' && (
                    <span className="catalog-mount-label">
                      {mountLabels[highlighted.mountType]}
                    </span>
                  )}
                </div>
                <div className="catalog-detail-title">
                  <div>
                    <span className="micro-label">PART DETAIL</span>
                    <h3>{getPartDisplayName(highlighted)}</h3>
                  </div>
                  {highlighted.isNPart && <span className="n-part-badge">N</span>}
                </div>
                <div className="catalog-primary-stats">
                  {reinforcementLabels.map(({ key, label }) => (
                    <div className={`catalog-primary-stat is-${key}`} key={key}>
                      <span>{label}</span>
                      <strong>{formatNumber(highlighted.stats[key])}</strong>
                    </div>
                  ))}
                </div>
                {optionLabels.length > 0 && (
                  <div className="part-option-list catalog-option-list">
                    {optionLabels.map((option) => (
                      <span
                        className={option.emphasized ? 'is-key-option' : ''}
                        key={option.text}
                      >
                        {option.text}
                      </span>
                    ))}
                  </div>
                )}
                {attackTarget && (
                  <p className="catalog-target-info">
                    <span>공격 대상</span>
                    <strong>{attackTarget}</strong>
                  </p>
                )}
                <div className="catalog-special-info">
                  <span className="micro-label">SPECIAL ABILITY</span>
                  <p>{highlighted.special || '등록된 특수 능력이 없습니다.'}</p>
                </div>
                <button
                  className="catalog-apply-button"
                  type="button"
                  onClick={() => onSelect(highlighted.id)}
                >
                  {value === highlighted.id
                    ? '현재 부품 유지'
                    : `${getPartDisplayName(highlighted)} 사용`}
                </button>
              </>
            ) : (
              <div className="catalog-empty-detail">확인할 부품을 선택해 주세요.</div>
            )}
          </aside>
        </div>
      </section>
    </div>
  )
}

function CatalogPartThumbnail({
  kind,
  partId,
  partName,
  index,
}: {
  kind: EditablePartSlot
  partId: number
  partName: string
  index: LocalResourceIndex | null
}) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const [shouldRender, setShouldRender] = useState(false)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (typeof IntersectionObserver === 'undefined') {
      setShouldRender(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setShouldRender(true)
        observer.disconnect()
      },
      { rootMargin: '180px' },
    )
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  return (
    <span className="catalog-result-thumbnail" ref={rootRef}>
      {shouldRender ? (
        <PartModelThumbnail
          kind={kind}
          partId={partId}
          partName={partName}
          index={index}
          deferModelLoad
        />
      ) : (
        <span className="model-thumbnail-empty is-loading" aria-hidden="true">
          <strong>3D</strong>
        </span>
      )}
    </span>
  )
}

function SubcoreCatalogDialog({
  slot,
  value,
  onClose,
  onSelect,
}: {
  slot: PartSlot
  value: number
  onClose: () => void
  onSelect: (id: number) => void
}) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  useCatalogDialog(onClose, searchRef)
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR')
  const filteredSubcores = partsCatalog.subcores.filter(
    (subcore) =>
      normalizedQuery.length === 0 ||
      subcore.name.toLocaleLowerCase('ko-KR').includes(normalizedQuery),
  )

  return (
    <div
      className="catalog-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="catalog-dialog subcore-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subcore-catalog-title"
      >
        <header className="catalog-dialog-header">
          <div>
            <span className="micro-label">SUB CORE CATALOG</span>
            <h2 id="subcore-catalog-title">{slotLabels[slot]} 서브코어 선택</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="서브코어 선택 닫기">
            <span className="catalog-close-icon" aria-hidden="true" />
          </button>
        </header>

        <div className="catalog-toolbar">
          <label className="catalog-search-field">
            <span aria-hidden="true">⌕</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="서브코어 이름 검색"
              aria-label={`${slotLabels[slot]} 서브코어 검색`}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <span className="subcore-slot-note">슬롯별 적용 수치를 표시합니다</span>
        </div>

        <div className="subcore-catalog-grid subcore-catalog-grid-standalone">
          {filteredSubcores.map((subcore) => {
            const optionLabels = getSubcoreOptionLabels(subcore.id, slot)

            return (
              <button
                className={value === subcore.id ? 'is-equipped' : ''}
                type="button"
                key={subcore.id}
                onClick={() => onSelect(subcore.id)}
                aria-label={`${subcore.name}, ${optionLabels.join(', ') || '추가 능력치 없음'}${value === subcore.id ? ', 현재 선택' : ''}`}
              >
                <LabUiSprite
                  className={`subcore-token subcore-token-${subcore.id % 4}`}
                  spriteKey={getSubcoreSpriteKey(subcore.id)}
                  label={`${subcore.name} 아이콘`}
                  fallback={<span className="sprite-fallback-text">{subcoreFallbackLabels[subcore.id]}</span>}
                />
                <strong>{subcore.name}</strong>
                <span className="subcore-card-tags" aria-hidden="true">
                  {optionLabels.length > 0 ? (
                    optionLabels.map((option) => <i key={option}>{option}</i>)
                  ) : (
                    <i>추가 능력치 없음</i>
                  )}
                </span>
              </button>
            )
          })}
          {filteredSubcores.length === 0 && (
            <div className="catalog-empty-result">
              <strong>일치하는 서브코어가 없습니다</strong>
              <span>검색어를 변경해 주세요.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function PartCardStat({
  label,
  value,
  bonus,
  tone,
  active = false,
  onClick,
}: {
  label: string
  value: number
  bonus?: number
  tone: 'health' | 'damage' | 'watt'
  active?: boolean
  onClick?: () => void
}) {
  const content = (
    <>
      <small>{label}</small>
      <strong>
        <b>{formatNumber(value)}</b>
        {bonus !== undefined && <em>{formatSignedNumber(bonus)}</em>}
      </strong>
    </>
  )

  if (onClick) {
    return (
      <button
        className={`part-card-stat part-card-stat-${tone} ${active ? 'is-active' : ''}`}
        type="button"
        aria-expanded={active}
        onClick={onClick}
      >
        {content}
      </button>
    )
  }

  return (
    <span className={`part-card-stat part-card-stat-${tone}`}>
      {content}
    </span>
  )
}

function PrimaryStat({
  label,
  value,
  additive,
  mark,
  tone,
}: {
  label: string
  value: number | string
  additive?: number
  mark: string
  tone: string
}) {
  return (
    <div className={`primary-stat tone-${tone}`}>
      <span aria-hidden="true">{mark}</span>
      <div>
        <small>{label}</small>
        <span className="primary-stat-value">
          <strong>{typeof value === 'number' ? formatNumber(value) : value}</strong>
          {additive !== undefined && additive !== 0 && (
            <em className="simulation-additive">{formatSignedNumber(additive)}</em>
          )}
        </span>
      </div>
    </div>
  )
}

function StatRow({
  label,
  value,
  hint,
  additive,
}: {
  label: string
  value: number | string
  hint?: string
  additive?: number
}) {
  return (
    <div className="stat-row">
      <span>
        {label} {hint && <small>{hint}</small>}
      </span>
      <strong>
        <b>{typeof value === 'number' ? formatNumber(value) : value}</b>
        {additive !== undefined && additive !== 0 && (
          <em className="simulation-additive">{formatSignedNumber(additive)}</em>
        )}
      </strong>
    </div>
  )
}

function SimulationCardHeader({
  mark,
  title,
  subtitle,
}: {
  mark: string
  title: string
  subtitle: string
}) {
  return (
    <div className="simulation-card-header">
      <span aria-hidden="true">{mark}</span>
      <div>
        <small>{subtitle}</small>
        <strong>{title}</strong>
      </div>
    </div>
  )
}

function SimulationToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className={`simulation-toggle ${checked ? 'is-checked' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true">
        <i />
      </span>
      <strong>{label}</strong>
    </label>
  )
}

function SimulationNumberField({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div className="simulation-number-field">
      <label>
        <span>{label}</span>
        <small>0–{max}</small>
      </label>
      <div>
        <button type="button" onClick={() => onChange(value - 1)} aria-label={`${label} 감소`}>
          −
        </button>
        <input
          type="number"
          min="0"
          max={max}
          value={value}
          aria-label={label}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <button type="button" onClick={() => onChange(value + 1)} aria-label={`${label} 증가`}>
          +
        </button>
      </div>
    </div>
  )
}

function MobileNavButton({
  label,
  mark,
  active,
  onClick,
}: {
  label: string
  mark: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button className={active ? 'is-active' : ''} type="button" onClick={onClick}>
      <span aria-hidden="true">{mark}</span>
      {label}
    </button>
  )
}

export default App
