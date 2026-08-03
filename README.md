# Nova Parts Calculator Web

노바 1492 부품 계산기와 사용자 승인 기반 로컬 GX 3D 미리보기를 제공하기
위한 웹 프로젝트입니다.

현재 저장소에는 React, TypeScript, Vite 기반 스캐폴딩과 개발 의존성만
구성되어 있습니다. 제품 요구사항과 구현 원칙은 `AGENTS.md`를 따릅니다.

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

브라우저 테스트 구현 후에는 Playwright 브라우저를 설치하고 아래 명령을
사용합니다.

```powershell
npx playwright install chromium firefox
npm run test:e2e
```

원본 GX, XFI, 텍스처와 로컬 변환 산출물은 저장소에 커밋하지 않습니다.
