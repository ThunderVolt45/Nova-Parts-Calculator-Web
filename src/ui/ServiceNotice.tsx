const BUG_REPORT_URL =
  'https://github.com/ThunderVolt45/Nova-Parts-Calculator-Web/issues/new?template=bug_report.yml'
const CLOUDFLARE_PRIVACY_URL = 'https://www.cloudflare.com/privacypolicy/'
const RIGHTS_REPORT_EMAIL = 'contactvolt45@gmail.com'
const RIGHTS_REPORT_SUBJECT = '[Nova Assembly] 권리 침해 신고'
const RIGHTS_REPORT_BODY = `아래 항목을 작성해 주세요. 불필요한 개인정보와 GX·XFI·텍스처 등 게임 원본 파일은 첨부하지 마세요.

1. 신고자 이름 또는 단체명:
2. 회신받을 이메일 주소:
3. 권리자 본인 또는 대리인 여부:
4. 권리 침해가 의심되는 서비스 URL 또는 화면:
5. 보호받는 저작물·상표 등 권리 대상:
6. 권리 보유 또는 대리 권한을 확인할 수 있는 근거:
7. 문제가 되는 사용 방식과 신고 사유:
8. 요청하는 조치:
9. 추가 참고사항:

본 신고 내용이 정확하며 선의로 제출되었음을 확인합니다.
전자 서명(이름):`
const RIGHTS_REPORT_URL = `mailto:${RIGHTS_REPORT_EMAIL}?subject=${encodeURIComponent(RIGHTS_REPORT_SUBJECT)}&body=${encodeURIComponent(RIGHTS_REPORT_BODY)}`

export function ServiceNotice() {
  return (
    <div className="service-notice">
      <a
        className="service-bug-report"
        href={BUG_REPORT_URL}
        target="_blank"
        rel="noreferrer"
      >
        버그 신고
      </a>

      <details>
        <summary>서비스 안내</summary>
        <article
          className="service-notice-card"
          aria-labelledby="service-notice-title"
        >
          <header>
            <span className="micro-label">PUBLIC SERVICE NOTICE</span>
            <h2 id="service-notice-title">서비스 및 개인정보 안내</h2>
            <small>안내 기준 · 2026-08-10</small>
          </header>

          <section>
            <h3>비공식 팬 제작 도구</h3>
            <p>
              이 서비스는 노바1492 이용자를 위해 개인이 만든 비공식 팬
              도구이며, 게임 개발사·운영사와 제휴하거나 승인받은 공식
              서비스가 아닙니다. 노바1492 명칭·로고·상표와 게임 자산의
              권리는 각 권리자에게 있습니다. 이 서비스는 원본 게임 자산을
              포함하거나 배포하지 않습니다.
            </p>
          </section>

          <section>
            <h3>로컬 파일과 브라우저 저장소</h3>
            <p>
              사용자가 직접 선택한 GX·XFI·텍스처 파일은 현재 브라우저
              안에서만 읽고 변환하며 앱 서버로 전송하지 않습니다. 덱,
              마지막 선택 상태, 변환된 GLB와 파서 메타데이터, UI 스프라이트
              캐시는 브라우저 IndexedDB에 저장될 수 있습니다. 원본 게임
              파일은 캐시에 복제하지 않습니다.
            </p>
            <p>
              모델 캐시는 앱의 전체 삭제 기능으로 지울 수 있고, 모든 로컬
              데이터는 브라우저의 사이트 데이터 삭제 기능으로 제거할 수
              있습니다. 서비스 자체는 로그인, 추적 쿠키, 광고 또는 분석
              스크립트를 사용하지 않습니다.
            </p>
          </section>

          <section>
            <h3>호스팅 기술 로그</h3>
            <p>
              정적 파일은 Cloudflare Pages를 통해 제공됩니다. 서비스 전달과
              보안을 위해 Cloudflare가 IP 주소, 요청 URL·시각, 브라우저 및
              기기 정보, 보안 이벤트 같은 기술 정보를 처리할 수 있습니다.
              세부 처리는
              {' '}
              <a href={CLOUDFLARE_PRIVACY_URL} target="_blank" rel="noreferrer">
                Cloudflare 개인정보 처리방침
              </a>
              을 따릅니다.
            </p>
          </section>

          <section>
            <h3>버그 및 권리 침해 신고</h3>
            <p>
              버그는 화면 상단의 버그 신고 버튼에서 GitHub Issue Form으로
              접수합니다. 공개 이슈에 개인정보, 설치 경로, GX·XFI·텍스처
              등 게임 원본 파일을 첨부하지 마세요.
            </p>
            <p>
              권리 침해 신고는 공개 이슈가 아닌 이메일로 직접 접수합니다.
              아래 버튼을 누르면 신고자 정보, 권리 근거, 대상 URL과 요청
              조치가 포함된 이메일 양식이 열립니다.
            </p>
            <a className="service-notice-contact" href={RIGHTS_REPORT_URL}>
              권리 침해 신고 이메일 작성
            </a>
            <small className="service-notice-email">수신: {RIGHTS_REPORT_EMAIL}</small>
          </section>
        </article>
      </details>
    </div>
  )
}
