# Nova Parts Calculator Web

노바 1492 부품 계산기와 사용자 승인 기반 로컬 GX 3D 미리보기를 제공하기
위한 웹 프로젝트입니다.

현재 저장소에는 React, TypeScript, Vite 기반 스캐폴딩과 기준 Python
계산기에서 이식한 검증·버전 지정 부품 카탈로그가 구성되어 있습니다. 제품
요구사항과 구현 원칙은 `AGENTS.md`를 따릅니다.

## 개발 명령

```powershell
npm install
npm run dev
```

## 검증 명령

```powershell
npm run typecheck
npm run lint
npm run test:run
npm run build
```

## 부품 카탈로그 갱신

형제 디렉터리의 `Nova-Parts-Calculator-Python` 기준 저장소에서 카탈로그를
다시 가져오려면 다음 명령을 사용합니다.

```powershell
npm run catalog:import
```

다른 위치에 있는 기준 저장소는 첫 번째 인자로 경로를 전달합니다.

```powershell
npm run catalog:import -- C:\path\to\Nova-Parts-Calculator-Python
```

브라우저 테스트 구현 후에는 Playwright 브라우저를 설치하고 아래 명령을
사용합니다.

```powershell
npx playwright install chromium firefox
npm run test:e2e
```

원본 GX, XFI, 텍스처와 로컬 변환 산출물은 저장소에 커밋하지 않습니다.
