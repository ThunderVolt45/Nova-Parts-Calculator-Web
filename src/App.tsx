import { useMemo, useState } from 'react'

import './App.css'
import { partsCatalog, partsCatalogById } from './data/catalog/catalog.ts'
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
  assemblyValidationMessages,
  validateAssembly,
} from './domain/calculation/validateAssembly.ts'

type EditablePartSlot = PartSlot | 'accessory'
type MobileView = 'assembly' | 'simulation' | 'stats' | 'deck'
type CenterMode = 'preview' | 'simulation'
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

const slotLabels: Record<EditablePartSlot, string> = {
  leg: '다리',
  body: '몸통',
  weapon: '무기',
  accessory: '액세서리',
}

const slotMarks: Record<EditablePartSlot, string> = {
  leg: 'L',
  body: 'B',
  weapon: 'W',
  accessory: 'A',
}

const mountLabels = {
  none: '일반형',
  tower: '탑형',
  arm: '팔형',
  shoulder: '어깨형',
} as const

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

function App() {
  const [partIds, setPartIds] = useState<AssemblyPartIds>(defaultPartIds)
  const [reinforcement, setReinforcement] = useState(defaultReinforcement)
  const [subcoreIds, setSubcoreIds] = useState(defaultSubcoreIds)
  const [activePart, setActivePart] = useState<EditablePartSlot>('weapon')
  const [activeReinforcement, setActiveReinforcement] =
    useState<ActiveReinforcement>(null)
  const [mobileView, setMobileView] = useState<MobileView>('assembly')
  const [activeDeckSlot, setActiveDeckSlot] = useState(0)
  const [calculateAsFloat, setCalculateAsFloat] = useState(false)
  const [centerMode, setCenterMode] = useState<CenterMode>('preview')
  const [simulation, setSimulation] =
    useState<SimulationInput>(emptySimulationInput)

  const validation = useMemo(
    () => validateAssembly(partIds, partsCatalogById),
    [partIds],
  )
  const baseInput = useMemo<BaseCalculationInput>(
    () => ({
      partIds,
      subcoreIds,
      reinforcement,
      accessoryRandomOptions: { health: 0, damage: 0, armor: 0 },
      calculateAsFloat,
    }),
    [calculateAsFloat, partIds, reinforcement, subcoreIds],
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
    setActivePart(slot)
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
    setActivePart('weapon')
    setActiveReinforcement(null)
    setCalculateAsFloat(false)
  }

  return (
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

        <nav className="desktop-nav" aria-label="주요 메뉴">
          <button className="is-active" type="button">
            계산기
          </button>
          <button type="button">내 덱</button>
          <button type="button">데이터</button>
        </nav>

        <div className="top-actions">
          <span className="catalog-badge">
            <i aria-hidden="true" /> 카탈로그 {partsCatalog.catalogVersion.split('-')[0]}
          </span>
          <button className="icon-button" type="button" aria-label="설정">
            <span aria-hidden="true">⚙</span>
          </button>
        </div>
      </header>

      <main id="main" className="workspace">
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
              value={partIds.leg}
              items={partsCatalog.parts.legs}
              subcoreId={subcoreIds.leg}
              reinforcement={reinforcement.leg}
              activeReinforcementKey={
                activeReinforcement?.slot === 'leg' ? activeReinforcement.key : undefined
              }
              calculateAsFloat={calculateAsFloat}
              onFocus={() => setActivePart('leg')}
              onChange={(id) => updatePart('leg', id)}
              onSubcoreChange={(id) => updateSubcore('leg', id)}
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
              value={partIds.body}
              items={partsCatalog.parts.bodies}
              subcoreId={subcoreIds.body}
              reinforcement={reinforcement.body}
              activeReinforcementKey={
                activeReinforcement?.slot === 'body' ? activeReinforcement.key : undefined
              }
              calculateAsFloat={calculateAsFloat}
              onFocus={() => setActivePart('body')}
              onChange={(id) => updatePart('body', id)}
              onSubcoreChange={(id) => updateSubcore('body', id)}
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
              onFocus={() => setActivePart('weapon')}
              onChange={(id) => updatePart('weapon', id)}
              onSubcoreChange={(id) => updateSubcore('weapon', id)}
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
              value={partIds.accessory}
              items={partsCatalog.parts.accessories}
              onFocus={() => setActivePart('accessory')}
              onChange={(id) => updatePart('accessory', id)}
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
                {isSimulationMode ? '전투 시뮬레이션' : '유닛 프리뷰'}
              </h2>
            </div>
            <div className="segmented-control center-mode-control" aria-label="중앙 화면 방식">
              <button
                className={centerMode === 'preview' ? 'is-active' : ''}
                type="button"
                onClick={() => setCenterMode('preview')}
              >
                3D 프리뷰
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

          {centerMode === 'preview' ? (
            <>
              <div className="model-stage">
                <div className="stage-grid" aria-hidden="true" />
                <div className="stage-readout stage-readout-left" aria-hidden="true">
                  <span>ROT 14.2</span>
                  <span>ZOOM 1.00</span>
                </div>
                <div className="stage-readout stage-readout-right" aria-hidden="true">
                  <span>GX OFFLINE</span>
                  <span>LOCAL ONLY</span>
                </div>
                <div className="unit-silhouette" aria-label="3D 모델 자리 표시자">
                  <div className="unit-weapon" />
                  <div className="unit-head" />
                  <div className="unit-body" />
                  <div className="unit-leg unit-leg-left" />
                  <div className="unit-leg unit-leg-right" />
                  <span className="scan-line" />
                </div>
                <div className="model-placeholder-copy">
                  <span className="prototype-badge">PROTOTYPE VIEW</span>
                  <strong>3D 리소스 연결 대기</strong>
                  <p>레이아웃 검증용 실루엣입니다</p>
                </div>
              </div>

              <div className="viewer-footer">
                <div className="animation-control">
                  <button
                    className="play-button"
                    type="button"
                    aria-label="애니메이션 재생"
                  >
                    <span aria-hidden="true">▶</span>
                  </button>
                  <div>
                    <span>ANIMATION</span>
                    <strong>Idle</strong>
                  </div>
                </div>
                <div className="timeline" aria-hidden="true">
                  <i />
                </div>
                <button className="camera-button" type="button">
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
                <button
                  className="simulation-reset"
                  type="button"
                  onClick={() => setSimulation(emptySimulationInput)}
                >
                  조건 초기화
                </button>
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
                {isSimulationMode && <span className="final-result-badge">FINAL</span>}
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
            <div className="validation-message" role="status">
              <strong>조립 불가</strong>
              <span>{validation.issues.length}개의 조건을 확인해 주세요.</span>
            </div>
          )}
        </aside>

        <section
          className={`panel deck-panel mobile-panel ${mobileView === 'deck' ? 'is-mobile-active' : ''}`}
          aria-labelledby="deck-title"
        >
          <div className="deck-heading">
            <div>
              <span className="micro-label">LOCAL DECK</span>
              <h2 id="deck-title">내 덱 · ALPHA</h2>
            </div>
            <span>10 UNIT SLOTS</span>
          </div>
          <div className="deck-slots">
            {Array.from({ length: 10 }, (_, index) => {
              const filled = index === 0
              return (
                <button
                  className={`${filled ? 'is-filled' : ''} ${activeDeckSlot === index ? 'is-active' : ''}`}
                  type="button"
                  key={index}
                  onClick={() => setActiveDeckSlot(index)}
                  aria-label={`${index + 1}번 덱 슬롯${filled ? ', 현재 유닛 저장됨' : ', 비어 있음'}`}
                >
                  <span className="slot-index">{String(index + 1).padStart(2, '0')}</span>
                  {filled ? (
                    <>
                      <span className="mini-unit" aria-hidden="true">
                        <i />
                      </span>
                      <strong>UNIT-01</strong>
                      <small>{selectedParts.weapon?.name}</small>
                    </>
                  ) : (
                    <>
                      <span className="empty-plus" aria-hidden="true">
                        +
                      </span>
                      <small>EMPTY</small>
                    </>
                  )}
                </button>
              )
            })}
          </div>
          <button className="save-unit-button" type="button">
            현재 유닛 저장
          </button>
        </section>
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
    </div>
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
  value,
  items,
  subcoreId,
  reinforcement,
  activeReinforcementKey,
  calculateAsFloat = false,
  onFocus,
  onChange,
  onSubcoreChange,
  onReinforcementSelect,
  onReinforcementChange,
}: {
  slot: EditablePartSlot
  active: boolean
  value: number
  items: ReadonlyArray<T>
  subcoreId?: number
  reinforcement?: PartReinforcement
  activeReinforcementKey?: keyof PartReinforcement
  calculateAsFloat?: boolean
  onFocus: () => void
  onChange: (id: number) => void
  onSubcoreChange?: (id: number) => void
  onReinforcementSelect?: (key: keyof PartReinforcement) => void
  onReinforcementChange?: (key: keyof PartReinforcement, value: number) => void
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
      className={`part-selector ${active ? 'is-active' : ''} ${isExpanded ? 'is-expanded' : ''}`}
    >
      <button
        className={`part-preview part-preview-${slot}`}
        type="button"
        onClick={onFocus}
        aria-label={`${slotLabels[slot]} 프리뷰 선택`}
      >
        <span className="part-grid" aria-hidden="true" />
        <span className="part-model" aria-hidden="true">
          <i />
        </span>
        {selectedSubcore && selectedSubcore.id !== 0 && (
          <span className={`subcore-sprite subcore-sprite-${slot}`}>
            <i aria-hidden="true" />
            <b aria-hidden="true" />
            <span className="sr-only">{selectedSubcore.name} 오버레이</span>
          </span>
        )}
        {selected && 'mountType' in selected && selected.mountType !== 'none' && (
          <span className={`mount-sprite mount-sprite-${selected.mountType}`}>
            <i aria-hidden="true" />
            <b aria-hidden="true" />
            <span className="sr-only">{mountLabels[selected.mountType]}</span>
          </span>
        )}
        <small>{slotMarks[slot]}</small>
      </button>

      <div className="part-details">
        <div className="part-card-label">
          <span>{slotLabels[slot]}</span>
          <small>ID {selected?.id ?? 0}</small>
        </div>
        <label className="part-select-field">
          <span className="sr-only">{slotLabels[slot]} 선택</span>
          <select
            value={value}
            onFocus={onFocus}
            onChange={(event) => onChange(Number(event.target.value))}
          >
            {items.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <span aria-hidden="true">⌄</span>
        </label>
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

        {subcoreId !== undefined && onSubcoreChange && (
          <label className="subcore-select-field">
            <span>
              <i aria-hidden="true" /> 서브코어
            </span>
            <select
              value={subcoreId}
              onFocus={onFocus}
              onChange={(event) => onSubcoreChange(Number(event.target.value))}
            >
              {partsCatalog.subcores.map((subcore) => (
                <option value={subcore.id} key={subcore.id}>
                  {subcore.name}
                </option>
              ))}
            </select>
          </label>
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
