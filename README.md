# SEO Blog Generator

키워드를 입력하면 상위 노출 게시글을 분석하고, SEO 최적화된 블로그 글을 AI로 자동 생성합니다.

## 주요 기능

- **경쟁사 분석** — 키워드 검색 상위 결과를 크롤링하여 SEO 패턴 분석
- **콘텐츠 생성** — 분석 결과를 바탕으로 Google Gemini AI가 블로그 글 작성
- **피드백 반영** — 생성된 글에 피드백을 남기면 개선된 버전 재생성 (최대 3회)
- **이미지 프롬프트** — 본문 중간에 이미지 생성용 프롬프트 자동 삽입
- **서비스 홍보 (선택)** — 특정 서비스를 본문에 자연스럽게 녹여 넣기

## 시작하기

### 1. 클론 및 설치

```bash
git clone https://github.com/JiHoon-0330/seo-blog-generator.git
cd seo-blog-generator
npm install
```

### 2. 환경변수 설정

```bash
cp .env.sample .env
```

`.env` 파일을 열고 값을 채워넣으세요:

```env
# 필수 — Google Gemini API 키
# https://aistudio.google.com/apikey 에서 무료 발급
GEMINI_API_KEY=your_gemini_api_key_here

# 선택 — 블로그 글에 자연스럽게 홍보할 서비스 정보
# 비워두면 서비스 홍보 없이 순수 정보성 글만 생성됩니다
SERVICE_NAME=내 서비스
SERVICE_DESCRIPTION=서비스에 대한 간단한 설명
SERVICE_URL=https://example.com
```

### 3. 실행

```bash
# 개발 모드
npm run dev

# 프로덕션 빌드 & 실행
npm run build
npm start
```

`http://localhost:5173` (dev) 또는 `http://localhost:3000` (prod)에서 확인하세요.

## 사용 방법

1. 타겟 키워드 입력 (예: "노트북 추천 2025")
2. AI가 상위 게시글 크롤링 → 분석 → 콘텐츠 생성 (1~2분 소요)
3. 생성된 글 확인 — 제목, 메타 디스크립션, 본문, 태그
4. 마음에 안 들면 피드백 남기고 재생성
5. HTML 복사 버튼으로 블로그에 바로 붙여넣기

## 기술 스택

- [React Router v7](https://reactrouter.com/) (Full-stack)
- [Google Gemini AI](https://ai.google.dev/) (Gemini 2.5 Flash)
- [SQLite](https://github.com/WiseLibs/better-sqlite3) (로컬 DB)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Cheerio](https://cheerio.js.org/) (HTML 크롤링)

## 커스터마이징

### AI 모델 변경

`app/lib/gemini.server.ts`에서 모델명을 변경할 수 있습니다:

```ts
return genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
```

### 생성 설정 조정

`app/lib/constants.ts`에서 설정값을 변경할 수 있습니다:

```ts
export const MAX_REGENERATIONS = 3;    // 최대 재생성 횟수
export const SEARCH_RESULTS_COUNT = 5; // 분석할 검색 결과 수
```

### 프롬프트 수정

`app/lib/gemini.server.ts`의 프롬프트 템플릿을 직접 수정하여 생성되는 글의 스타일, 톤, 구조를 커스터마이징할 수 있습니다.

## License

MIT
