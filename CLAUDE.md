# CLAUDE.md

이 파일은 Claude Code(AI 코딩 에이전트)가 프로젝트를 이해하고 효과적으로 작업할 수 있도록 돕는 가이드입니다.

## 프로젝트 개요

SEO 최적화 블로그 콘텐츠를 AI로 자동 생성하는 풀스택 웹 앱입니다.
키워드 입력 → 상위 검색 결과 크롤링 → 경쟁사 분석 → AI 콘텐츠 생성의 파이프라인으로 동작합니다.

## 기술 스택

- **프레임워크**: React Router v7 (풀스택 SSR)
- **AI**: Google Gemini 2.5 Flash (`@google/generative-ai`)
- **DB**: SQLite (better-sqlite3, WAL 모드)
- **스타일링**: Tailwind CSS v4
- **크롤링**: Cheerio
- **런타임**: Node.js

## 명령어

```bash
npm run dev        # 개발 서버 (http://localhost:5173)
npm run build      # 프로덕션 빌드
npm start          # 프로덕션 실행 (http://localhost:3000)
npm run typecheck  # 타입 체크
```

## 프로젝트 구조

```
app/
├── routes/
│   ├── _index.tsx          # 메인 페이지 (loader, action, UI 모두 포함)
│   └── api.status.ts       # 생성 상태 폴링 API (GET /api/status)
├── lib/
│   ├── gemini.server.ts    # Gemini AI 호출 (분석, 생성, 재생성)
│   ├── search.server.ts    # DuckDuckGo 검색 + 페이지 크롤링
│   ├── db.server.ts        # SQLite DB 스키마 및 CRUD
│   ├── status.server.ts    # 인메모리 생성 상태 관리
│   └── constants.ts        # 설정 상수 (SERVICE, MAX_REGENERATIONS 등)
├── app.css                 # 전역 스타일 (.prose 타이포그래피, .image-prompt 등)
├── root.tsx                # 루트 레이아웃
└── routes.ts               # 라우트 설정
```

## 핵심 아키텍처

### 데이터 흐름

1. 사용자가 키워드 입력 → `generate` intent로 action 호출
2. `searchAndCrawl()` → DuckDuckGo 검색 후 상위 5개 결과 크롤링
3. `analyzeCompetitors()` → Gemini로 경쟁사 SEO 패턴 분석
4. `generateSEOContent()` → 분석 기반 블로그 글 생성 (JSON 응답)
5. DB에 session + generation 저장
6. 피드백 후 `regenerateWithFeedback()`으로 재생성 (최대 3회)

### DB 구조

- **sessions**: 키워드별 생성 세션 (id, keyword, search_results, analysis)
- **generations**: 세션별 생성 버전들 (version, title, content, rating, feedback)

### UI 상태 관리

- `useFetcher`로 generate/regenerate 처리 → 생성 중에도 히스토리 탐색 가능
- `Form`으로 load 처리 → 기존 글 불러오기
- `/api/status` 3초 폴링으로 다른 탭의 생성 상태 감지

### 환경변수 (`vite.config.ts`의 `define`으로 주입)

- `GEMINI_API_KEY` (필수) — Gemini API 키
- `SERVICE_NAME`, `SERVICE_DESCRIPTION`, `SERVICE_URL` (선택) — 홍보 서비스 정보. 비워두면 순수 정보성 글만 생성

## 코드 수정 가이드

### AI 프롬프트 수정

`app/lib/gemini.server.ts`에 3개의 프롬프트가 있습니다:
- `analyzeCompetitors()` — 경쟁사 분석 프롬프트
- `generateSEOContent()` — 초기 생성 프롬프트
- `regenerateWithFeedback()` — 재생성 프롬프트

프롬프트 끝에 JSON 응답 형식 지정이 있으며, `parseGenerateResult()`가 파싱합니다.
`GenerateResult` 타입: `{ title, metaDescription, content, tags }`.

### 서비스 홍보 로직

`SERVICE.name`이 비어있으면 프롬프트에서 홍보 관련 섹션이 자동으로 제외됩니다.
`getServicePromptBlock()`과 `getServiceContentRule()` 헬퍼가 이를 처리합니다.

### 스타일 추가

`app/app.css`에서 `.prose` 하위 스타일을 정의합니다.
생성된 콘텐츠는 `dangerouslySetInnerHTML`로 `.prose` 컨테이너에 렌더링됩니다.

### 새 라우트 추가

`app/routes.ts`에서 라우트를 정의합니다 (React Router v7 파일 기반 라우팅).

## 주의사항

- `.server.ts` 접미사 파일은 서버에서만 실행됩니다
- `status.server.ts`는 인메모리 상태이므로 서버 재시작 시 초기화됩니다
- DB 파일(`data/seo.db`)은 `.gitignore`에 포함되어 있습니다
- 크롤링 시 DuckDuckGo HTML 검색을 사용하므로 API 키가 불필요합니다
