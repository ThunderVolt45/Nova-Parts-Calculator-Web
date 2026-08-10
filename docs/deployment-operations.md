# Cloudflare Pages 배포 및 운영 가이드

이 문서는 GitHub 저장소와 연결된 Cloudflare Pages 정적 배포의 설정, 첫 배포
전 점검, 롤백, 캐시와 장애 확인 절차를 기록합니다. 실제 첫 배포와 실서비스
검증은 T23에서 수행합니다.

## Pages 빌드 설정

| 항목 | 값 |
| --- | --- |
| Production branch | `main` |
| Framework preset | `React (Vite)` |
| Root directory | 저장소 루트(비워 둠) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js | 22 |

저장소 루트의 `.node-version`이 Pages 빌드 런타임을 Node.js 22로 고정합니다.
대시보드에 `NODE_VERSION` 환경 변수가 이미 있다면 값도 `22`로 맞춰 충돌을
피합니다. 현재 빌드는 비밀값이나 별도 환경 변수를 요구하지 않습니다.

앱은 현재 루트 한 경로만 사용하는 정적 Vite 앱입니다. `public/_redirects`,
Pages Functions와 `_worker.js`는 추가하지 않습니다. 클라이언트 라우트가 생기면
SPA 폴백 정책을 다시 검토합니다.

관련 Cloudflare 공식 문서:

- [Pages 빌드 설정](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [빌드 이미지와 런타임 버전](https://developers.cloudflare.com/pages/configuration/build-image/)
- [Git 연동](https://developers.cloudflare.com/pages/configuration/git-integration/)

## 응답 헤더와 검색 노출 정책

`public/_headers`는 빌드할 때 `dist/_headers`로 복사되며 Pages가 정적 응답에
적용합니다.

- 모든 정적 응답에 HSTS, MIME 스니핑 방지, 프레임 삽입 차단,
  `no-referrer`와 불필요한 브라우저 권한 차단을 적용합니다.
- `*.pages.dev` 프로덕션 주소와 브랜치 프리뷰 주소에는
  `X-Robots-Tag: noindex`를 적용합니다. 첫 배포 검증 중인 주소와 향후 커스텀
  도메인이 검색 결과에서 중복 노출되는 것을 방지하기 위한 결정입니다.
- 커스텀 도메인을 연결하면 해당 도메인은 현재 규칙상 `noindex` 대상이
  아닙니다. 공개 시점에 검색 노출 여부와 canonical 정책을 다시 결정합니다.
- 엄격한 Content Security Policy는 Web Worker, Blob URL, WebGL과 향후 외부
  스크립트 호환성을 실제 배포 환경에서 검증한 뒤 도입합니다.

Cloudflare Pages의 `_headers`는 정적 파일 응답에만 적용됩니다. 나중에 Pages
Functions나 SSR을 추가하면 함수 응답에도 같은 정책을 직접 적용해야 합니다.
[Pages 헤더 문서](https://developers.cloudflare.com/pages/configuration/headers/)에서
현재 문법과 제한을 확인할 수 있습니다.

## 배포 전 점검

`main` 푸시는 첫 배포 이후 프로덕션 배포를 시작할 수 있으므로 푸시 전에
저장소 루트에서 다음 검사를 모두 통과시킵니다.

```powershell
npm ci
npm run typecheck
npm run lint
npm run test:run
npm run test:e2e
npm run build
```

빌드 후에는 다음을 확인합니다.

- `dist/index.html`, `dist/favicon.svg`, `dist/_headers`와 해시가 붙은 JS/CSS
  청크가 존재합니다.
- `dist`에 GX, XFI, GLB, 원본 텍스처와 소스맵(`*.map`)이 없습니다.
- `git status --short`에 의도하지 않은 생성 파일이나 변경이 없습니다.
- 배포할 커밋의 한 줄 한글 Conventional Commit 메시지가
  `COMMIT_CONVENTION.md`를 따릅니다.

첫 `Save and Deploy`를 누른 뒤 Pages의 배포 상세 화면에서 빌드 커밋 SHA가
GitHub `main`의 대상 커밋과 같은지 확인합니다. 빌드가 실패하면 공개 배포를
진행하지 말고 최초 오류부터 수정한 뒤 새 커밋으로 다시 배포합니다.

## 배포 후 스모크 테스트

실제 `https://<project>.pages.dev` 주소에서 다음을 점검합니다.

1. HTTPS 루트, 파비콘, JS/CSS 청크와 Worker 청크가 모두 200 응답을 반환합니다.
2. 루트 응답에 `Strict-Transport-Security`, `X-Content-Type-Options`,
   `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
   `X-Robots-Tag: noindex`가 있습니다.
3. 데스크톱 Chromium과 Firefox에서 계산, 덱 저장·복원, JSON 왕복을 확인합니다.
4. 두 브라우저에서 로컬 `common` 폴더 승인, 모델 변환, IndexedDB 캐시 복원을
   확인합니다.
5. 모바일에서 계산기와 덱이 동작하고 3D가 PC 전용으로 안내되는지 확인합니다.
6. 개발자 도구 Network에서 로컬 게임 파일이나 변환 결과가 외부로 전송되지
   않고, 앱의 정적 GET 요청만 발생하는지 확인합니다.

헤더는 다음처럼 빠르게 확인할 수 있습니다.

```powershell
curl.exe -I https://<project>.pages.dev/
curl.exe -I https://<project>.pages.dev/favicon.svg
```

점검 결과, 배포 URL, 커밋 SHA, 브라우저 버전과 발견한 문제를 T23 기록에
남깁니다. 오류 기록에는 로컬 설치 경로나 게임 원본 데이터를 넣지 않습니다.

## 롤백

서비스 사용을 막는 회귀나 개인정보·보안 문제가 발견되면 다음 순서로
대응합니다.

1. Pages 프로젝트의 `Deployments`에서 마지막 정상 프로덕션 배포와 커밋을
   확인합니다.
2. 대상 배포의 메뉴에서 `Rollback to this deployment`를 선택하고 확인합니다.
   프리뷰 배포는 롤백 대상으로 사용할 수 없습니다.
3. 프로덕션 URL에서 핵심 흐름과 응답 헤더를 다시 점검합니다.
4. GitHub `main`에는 문제가 있는 코드가 그대로 남으므로 원인을 수정하거나
   문제 커밋을 되돌리는 새 커밋을 만든 뒤 전체 검증을 거쳐 재배포합니다.

롤백 시각, 원인, 이전/대상 커밋 SHA, 확인자를 장애 기록에 남깁니다. 자세한
대시보드 절차는 [Pages 롤백 문서](https://developers.cloudflare.com/pages/configuration/rollbacks/)를
따릅니다.

## 캐시 확인

Pages의 기본 CDN 캐시와 ETag 재검증을 사용하며 HTML에 별도 장기 캐시 규칙을
추가하지 않습니다. Vite의 JS/CSS 파일명에는 콘텐츠 해시가 있어 새 배포 시
HTML이 새 파일을 참조합니다.

화면이 이전 버전처럼 보이면 다음 순서로 확인합니다.

1. Pages가 제공하는 커밋 SHA와 기대한 `main` 커밋을 비교합니다.
2. 시크릿 창이나 강력 새로고침으로 브라우저 캐시 문제를 구분합니다.
3. 루트 HTML과 청크의 응답 헤더, ETag, 요청 URL을 확인합니다.
4. 새 배포 뒤에도 CDN이 오래된 파일을 제공하는 것이 확인된 경우에만
   Cloudflare 대시보드의 `Caching > Configuration`에서 해당 URL을 우선
   삭제하고, 범위를 특정할 수 없을 때 `Purge Everything`을 사용합니다.

Pages 빌드 캐시는 npm 의존성 등 빌드 입력을 재사용하는 캐시이며 서비스 응답
캐시와 다릅니다. 의존성 설치나 빌드 결과가 비정상일 때만 `Settings > Build >
Build cache`에서 비우고 재배포합니다. 브라우저 IndexedDB의 덱·모델 캐시도
Cloudflare CDN 캐시와 별개이므로 서비스 장애 대응 중 임의로 삭제하지
않습니다.

[Pages 제공 및 캐시 동작](https://developers.cloudflare.com/pages/configuration/serving-pages/)과
[Pages 빌드 캐시](https://developers.cloudflare.com/pages/configuration/build-caching/)를
운영 기준으로 사용합니다.

## 장애 분류와 확인 순서

| 증상 | 우선 확인 | 대응 |
| --- | --- | --- |
| 빌드 실패 | Pages 최초 오류, Node 버전, `npm ci` | 로컬 재현 후 수정 커밋 배포 |
| 흰 화면/청크 404 | 배포 SHA, `index.html`의 청크 URL | 정상 배포로 롤백, 캐시 확인 |
| 헤더 누락 | `dist/_headers`, 정적 응답 여부 | 빌드 산출물과 Pages 규칙 확인 |
| 계산/덱 회귀 | 브라우저 콘솔, 재현 JSON, 해당 테스트 | 정상 배포로 롤백 후 회귀 테스트 추가 |
| 3D만 실패 | PC 여부, 폴더 승인, Worker, IndexedDB | 원본 전송 없이 로컬 권한·캐시 상태 확인 |
| 특정 지역 접속 이상 | HTTP 상태, `Cf-Ray`, 발생 시각 | 민감정보 없이 Cloudflare 장애 상태와 로그 확인 |

장애가 사용자 데이터 손실이나 외부 전송 가능성과 관련되면 기능 복구보다 먼저
영향 범위를 확인하고 필요하면 즉시 롤백합니다. 기술 로그나 GitHub 이슈에는
GX/XFI/텍스처, 변환 GLB, 덱 내용, 설치 경로 같은 사용자 로컬 데이터를
첨부하지 않습니다.
