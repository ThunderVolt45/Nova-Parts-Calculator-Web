import { useRef } from 'react'
import { createPortal } from 'react-dom'

import './UserGuide.css'
import { useModalDialog } from './useModalDialog.ts'

interface UserGuideProps {
  open: boolean
  onClose(): void
}

const quickStartSteps = [
  ['01', '부품 선택', '다리·몸통·무기를 선택해 조립 완료 상태를 만듭니다.'],
  ['02', '세부 설정', '강화 수치, 서브코어와 액세서리 옵션을 입력합니다.'],
  ['03', '결과 확인', '능력치와 시뮬레이션 결과를 실시간으로 비교합니다.'],
  ['04', '덱에 저장', '슬롯을 고르고 유닛 이름을 입력한 뒤 등록합니다.'],
] as const

export function UserGuide({ open, onClose }: UserGuideProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const detailsRef = useRef<HTMLElement>(null)

  useModalDialog({
    dialogRef,
    initialFocusRef: closeRef,
    open,
    onClose,
  })

  if (!open) return null

  return createPortal(
    <div
      className="user-guide-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <article
        ref={dialogRef}
        className="user-guide-dialog"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="user-guide-title"
        aria-describedby="user-guide-summary"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="user-guide-header">
          <div>
            <span className="micro-label">QUICK GUIDE · 3 MIN</span>
            <h2 id="user-guide-title">Nova Assembly 사용 가이드</h2>
            <p id="user-guide-summary">
              조립부터 덱 백업과 3D 프리뷰까지, 필요한 기능을 한 화면에서 확인하세요.
            </p>
          </div>
          <button
            ref={closeRef}
            className="user-guide-close"
            type="button"
            aria-label="사용 가이드 닫기"
            onClick={onClose}
          >
            <span className="user-guide-close-icon" aria-hidden="true" />
          </button>
        </header>

        <div className="user-guide-content">
          <section className="user-guide-section user-guide-intro" aria-labelledby="guide-quick-title">
            <div className="user-guide-onboarding-layout">
              <div className="user-guide-onboarding-copy">
                <div className="user-guide-section-heading">
                  <span>QUICK START</span>
                  <h3 id="guide-quick-title">처음이라면 이 순서로 시작하세요</h3>
                  <p>네 단계만 따라 하면 첫 유닛을 계산하고 덱에 저장할 수 있습니다.</p>
                </div>
                <div className="user-guide-quick-grid">
                  {quickStartSteps.map(([mark, title, description]) => (
                    <article key={mark}>
                      <span>{mark}</span>
                      <strong>{title}</strong>
                      <p>{description}</p>
                    </article>
                  ))}
                </div>
                <div className="user-guide-start-actions">
                  <button className="user-guide-start-button" type="button" onClick={onClose}>
                    가이드 닫고 조립 시작
                  </button>
                  <button
                    className="user-guide-details-button"
                    type="button"
                    onClick={() => detailsRef.current?.scrollIntoView({
                      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                        ? 'auto'
                        : 'smooth',
                      block: 'start',
                    })}
                  >
                    전체 기능 자세히 보기
                  </button>
                </div>
              </div>
              <div className="user-guide-onboarding-visual">
                <GuideFigure
                  src="/guide/overview-hd.jpg"
                  width={2457}
                  height={1431}
                  alt="Nova Assembly 데스크톱 화면의 덱, 부품 조립, 3D 프리뷰와 능력치 영역"
                  caption="PC에서는 덱, 조립, 프리뷰, 능력치를 한 화면에서 확인합니다. 이미지를 누르면 크게 볼 수 있습니다."
                />
                <p className="user-guide-mobile-note">
                  <strong>모바일:</strong> 화면 아래의 <code>조립</code>, <code>시뮬레이션</code>,{' '}
                  <code>능력치</code>, <code>덱</code> 버튼으로 전환합니다. 계산과 덱은
                  사용할 수 있지만 3D와 로컬 게임 폴더 연결은 PC 전용입니다.
                </p>
              </div>
            </div>
          </section>

          <section
            ref={detailsRef}
            className="user-guide-section"
            aria-labelledby="guide-build-title"
          >
            <div className="user-guide-section-heading">
              <span>01 · UNIT BUILD</span>
              <h3 id="guide-build-title">부품을 선택하고 강화하기</h3>
            </div>
            <ol className="user-guide-steps">
              <li>
                다리, 몸통, 무기 또는 액세서리의 <strong>부품 이름</strong>을 누릅니다.
              </li>
              <li>
                이름 검색과 지상·공중·탑형·팔형·어깨형·N 부품 필터로 목록을 좁힙니다.
              </li>
              <li>
                부품을 누른 뒤 상세 능력치와 특수 능력을 확인하고 <strong>사용</strong>을
                선택합니다.
              </li>
              <li>
                카드의 와트·체력·공격을 누르면 0~100 강화 입력이 열립니다. 각 카드의{' '}
                <strong>서브코어</strong>도 같은 방식으로 선택합니다.
              </li>
            </ol>
            <GuideFigure
              src="/guide/parts-catalog-hd.jpg"
              width={2473}
              height={1440}
              alt="몸통 부품 선택 창의 검색, 타입 필터, 부품 목록과 상세 정보"
              caption="목록에서 한 번 선택해 상세 정보를 확인한 뒤 하단의 사용 버튼으로 적용합니다."
            />
            <div className="user-guide-callout is-warning">
              <strong>조립 불가가 표시되면</strong>
              <p>
                몸통과 무기의 형태, 부품 무게와 다리 하중, N 부품 개수를 먼저 확인하세요.
                다리·몸통·무기가 없거나 아포칼립스 전용 조건을 어겨도 덱 등록이
                비활성화됩니다.
              </p>
            </div>
          </section>

          <section className="user-guide-section" aria-labelledby="guide-stats-title">
            <div className="user-guide-section-heading">
              <span>02 · CALCULATION</span>
              <h3 id="guide-stats-title">능력치와 시뮬레이션 비교하기</h3>
            </div>
            <div className="user-guide-two-column">
              <div>
                <h4>능력치</h4>
                <ul>
                  <li>하중은 사용 무게, 최대 하중과 잔여량으로 표시됩니다.</li>
                  <li>와트, 체력, 공격력과 현재 조합에 존재하는 추가 능력치를 표시합니다.</li>
                  <li><code>실수 계산</code>을 끄면 게임 방식의 정수 절삭 결과를 사용합니다.</li>
                  <li>부품의 패시브·액티브 설명은 특수 능력 영역에서 확인합니다.</li>
                </ul>
              </div>
              <div>
                <h4>전투 시뮬레이션</h4>
                <ul>
                  <li>전투 상태, 스킬, 팀 효과와 스퀘어 아이템 수치를 설정합니다.</li>
                  <li><code>BASE</code>는 기본값, <code>FINAL</code>은 전투 조건 적용값입니다.</li>
                  <li>능력치 옆의 +/− 숫자는 기본값과 최종값의 차이입니다.</li>
                  <li>시뮬레이션 조건은 덱 유닛에 저장되지 않습니다.</li>
                </ul>
              </div>
            </div>
            <GuideFigure
              src="/guide/simulation-hd.jpg"
              width={2457}
              height={1431}
              alt="전투 상태, 스킬, 팀 효과를 설정하는 시뮬레이션 화면과 최종 능력치"
              caption="조건을 바꾸면 FINAL 능력치가 즉시 갱신되며 조건 초기화로 모두 해제할 수 있습니다."
            />
          </section>

          <section className="user-guide-section" aria-labelledby="guide-deck-title">
            <div className="user-guide-section-heading">
              <span>03 · LOCAL DECK</span>
              <h3 id="guide-deck-title">덱에 저장하고 내보내기</h3>
            </div>
            <div className="user-guide-two-column">
              <div>
                <h4>10칸 덱 관리</h4>
                <ol>
                  <li>덱과 1~10번 슬롯을 선택합니다.</li>
                  <li>정상 유닛을 조립하고 이름을 입력합니다.</li>
                  <li><code>유닛 등록</code>으로 저장하거나 기존 유닛을 교체합니다.</li>
                  <li>덱 안에서는 유닛을 드래그해 순서를 바꾸고, 복사·붙여넣기로 다른 슬롯이나 덱에 옮깁니다.</li>
                </ol>
              </div>
              <div>
                <h4>안전한 백업</h4>
                <p>
                  현재 유닛, 현재 덱 또는 전체 덱을 JSON으로 내보낼 수 있습니다. 중요한
                  덱은 정기적으로 <strong>전체 덱</strong> 백업을 저장하세요.
                </p>
                <p>
                  현재 유닛은 부품·강화·최종 능력치와 로컬 3D 렌더를 포함한
                  <strong> 1600×1000 PNG</strong>로도 저장할 수 있습니다. PNG 저장 전에는
                  게임 리소스 폴더를 연결해 모든 렌더를 준비하세요.
                </p>
                <p>
                  가져오기에서는 기존 덱과 병합하거나 전체 교체할 수 있습니다. 전체 교체
                  전에는 현재 덱을 먼저 내보내는 것이 안전합니다.
                </p>
              </div>
            </div>
            <p className="user-guide-footnote">
              덱은 계정이 아니라 현재 브라우저의 IndexedDB에 저장됩니다. 다른 브라우저,
              기기, 시크릿 창이나 다른 서비스 주소에는 자동으로 나타나지 않습니다.
            </p>
          </section>

          <section className="user-guide-section" aria-labelledby="guide-3d-title">
            <div className="user-guide-section-heading">
              <span>04 · PC 3D PREVIEW</span>
              <h3 id="guide-3d-title">게임 리소스로 3D 보기</h3>
            </div>
            <ol className="user-guide-steps">
              <li><code>common 폴더 선택</code>을 누릅니다.</li>
              <li>
                Nova 1492 설치 폴더의 <code>datan/common</code>을 선택합니다. 기본 위치는{' '}
                <code>C:\Program Files (x86)\Nova1492\datan\common</code>입니다.
              </li>
              <li>파일 연결과 모델 캐시 준비가 끝나면 썸네일과 조립 모델이 표시됩니다.</li>
              <li>드래그로 회전하고 휠로 확대·축소합니다. Idle·Move·Attack도 선택할 수 있습니다.</li>
            </ol>
            <div className="user-guide-callout is-safe">
              <strong>로컬 파일은 서버로 전송되지 않습니다</strong>
              <p>
                선택한 파일은 브라우저 안에서만 읽습니다. 변환된 GLB와 UI 스프라이트만
                캐시할 수 있으며 원본 GX·XFI·텍스처와 설치된 게임 파일은 변경하지 않습니다.
                <code>리소스 캐시 &gt; 전체 삭제</code>는 덱과 원본 파일을 건드리지 않습니다.
                덱을 포함해 이 앱이 저장한 정보를 모두 지우려면
                <code>설정 &gt; 브라우저 저장 정보 모두 삭제</code>를 사용하세요.
              </p>
            </div>
          </section>

          <section className="user-guide-section" aria-labelledby="guide-help-title">
            <div className="user-guide-section-heading">
              <span>05 · TROUBLESHOOTING</span>
              <h3 id="guide-help-title">문제가 생겼을 때</h3>
            </div>
            <dl className="user-guide-faq">
              <div>
                <dt>모델이 보이지 않아요</dt>
                <dd>
                  정확한 <code>datan/common</code> 폴더인지 확인하고 다시 선택하세요. 계속
                  실패하면 3D 캐시를 삭제한 뒤 다시 연결합니다.
                </dd>
              </div>
              <div>
                <dt>저장한 덱이 사라졌어요</dt>
                <dd>
                  원래 사용한 브라우저와 사이트 주소인지 확인하세요. 백업 JSON이 있다면
                  가져오기로 복원할 수 있습니다.
                </dd>
              </div>
              <div>
                <dt>버그를 신고하고 싶어요</dt>
                <dd>
                  상단의 <code>버그 신고</code>를 이용하세요. 공개 이슈에는 개인정보, 설치
                  경로 또는 게임 원본 파일을 첨부하지 마세요.
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </article>
    </div>,
    document.body,
  )
}

function GuideFigure({
  src,
  width,
  height,
  alt,
  caption,
}: {
  src: string
  width: number
  height: number
  alt: string
  caption: string
}) {
  return (
    <figure className="user-guide-figure">
      <a href={src} target="_blank" rel="noreferrer" aria-label={`${alt}, 크게 보기`}>
        <img src={src} alt={alt} width={width} height={height} loading="lazy" />
      </a>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}
