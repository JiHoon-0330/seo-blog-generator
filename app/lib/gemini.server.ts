import { GoogleGenerativeAI } from "@google/generative-ai";
import { SERVICE } from "./constants";
import type { AnalysisInput } from "./search.server";
import type { Generation } from "./db.server";

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY must be set");
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
}

export async function analyzeCompetitors(
  crawledData: AnalysisInput
): Promise<string> {
  const model = getModel();

  const resultsText = crawledData.results
    .map(
      (r, i) =>
        `--- 게시글 ${i + 1} ---
URL: ${r.url}
제목: ${r.title}
메타 디스크립션: ${r.metaDescription}
헤딩 구조:
${r.headings.join("\n")}
본문 (일부):
${r.bodyText.substring(0, 1500)}`
    )
    .join("\n\n");

  const prompt = `다음은 '${crawledData.keyword}' 키워드로 Google 검색 시 상위 노출되는 게시글들입니다.

${resultsText}

위 게시글들의 공통적인 특징을 분석해주세요:
1. SEO 전략 (키워드 사용 빈도, 위치)
2. 제목 패턴 (어떤 형식의 제목을 사용하는지)
3. 헤딩(H1~H3) 구조
4. 콘텐츠 구성 방식 (도입부, 본문, 결론 등)
5. 글의 길이와 톤
6. 자주 다루는 소주제

한국어로 간결하게 분석해주세요.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

export interface GenerateResult {
  title: string;
  metaDescription: string;
  content: string;
  tags: string[];
}

function getServicePromptBlock(): string {
  if (!SERVICE.name) return "";
  return `
## 홍보할 서비스 정보
- 서비스명: ${SERVICE.name}
- 설명: ${SERVICE.description}
- URL: ${SERVICE.url}`;
}

function getServiceContentRule(): string {
  if (!SERVICE.name) return "";
  return `   - 서비스(${SERVICE.name})를 본문 중간에 자연스럽게 1~2회 언급 (과하지 않게)\n`;
}

export async function generateSEOContent(
  keyword: string,
  analysis: string
): Promise<GenerateResult> {
  const model = getModel();

  const prompt = `당신은 SEO 전문 블로그 콘텐츠 작성자입니다.

## 타겟 키워드
${keyword}

## 경쟁사 분석 결과
${analysis}
${getServicePromptBlock()}

## 요구사항
위 경쟁사 분석을 바탕으로, 상위 노출될 수 있는 SEO 최적화 블로그 글을 작성해주세요.

1. **제목**: 타겟 키워드를 포함하고 클릭을 유도하는 매력적인 제목
2. **메타 디스크립션**: 150자 이내, 키워드 포함
3. **본문**: HTML 형식으로 작성
   - H2, H3 태그를 활용한 체계적 구조
   - 타겟 키워드의 자연스러운 배치
${getServiceContentRule()}   - 독자에게 실질적 가치를 제공하는 정보성 콘텐츠
   - FAQ 섹션 포함
   - 최소 1500자 이상
   - 본문 중간에 적절한 위치(소주제 전환, 핵심 개념 설명 후 등)에 이미지 추천 프롬프트를 삽입
   - 형식: <div class="image-prompt">[이미지: 이미지 생성 AI에 입력할 구체적인 프롬프트]</div>
   - 2~3개 정도 삽입, 글의 맥락에 맞는 시각적 설명
4. **태그**: 관련 키워드 태그 5~8개

## 응답 형식
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.
\`\`\`json
{
  "title": "블로그 제목",
  "metaDescription": "메타 디스크립션",
  "content": "<h2>...</h2><p>...</p>...",
  "tags": ["태그1", "태그2", ...]
}
\`\`\``;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return parseGenerateResult(text);
}

export async function regenerateWithFeedback(
  keyword: string,
  analysis: string,
  previousGenerations: Generation[]
): Promise<GenerateResult> {
  const model = getModel();

  const historyText = previousGenerations
    .map(
      (g) =>
        `--- 버전 ${g.version} ---
제목: ${g.title}
평가: ${g.rating === "good" ? "좋아요" : g.rating === "bad" ? "아쉬워요" : "미평가"}
피드백: ${g.feedback || "없음"}
본문 일부: ${g.content.substring(0, 500)}...`
    )
    .join("\n\n");

  const prompt = `당신은 SEO 전문 블로그 콘텐츠 작성자입니다.

## 타겟 키워드
${keyword}

## 경쟁사 분석 결과
${analysis}
${getServicePromptBlock()}

## 이전 생성 이력 및 피드백
${historyText}

## 요구사항
이전 버전들에 대한 피드백을 반영하여 개선된 SEO 최적화 블로그 글을 작성해주세요.
특히 사용자가 "아쉬워요"라고 평가하고 남긴 피드백을 중점적으로 반영하세요.

1. **제목**: 타겟 키워드를 포함하고 클릭을 유도하는 매력적인 제목
2. **메타 디스크립션**: 150자 이내, 키워드 포함
3. **본문**: HTML 형식으로 작성
   - H2, H3 태그를 활용한 체계적 구조
   - 타겟 키워드의 자연스러운 배치
${getServiceContentRule()}   - 독자에게 실질적 가치를 제공하는 정보성 콘텐츠
   - FAQ 섹션 포함
   - 최소 1500자 이상
   - 본문 중간에 적절한 위치(소주제 전환, 핵심 개념 설명 후 등)에 이미지 추천 프롬프트를 삽입
   - 형식: <div class="image-prompt">[이미지: 이미지 생성 AI에 입력할 구체적인 프롬프트]</div>
   - 2~3개 정도 삽입, 글의 맥락에 맞는 시각적 설명
4. **태그**: 관련 키워드 태그 5~8개

## 응답 형식
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.
\`\`\`json
{
  "title": "블로그 제목",
  "metaDescription": "메타 디스크립션",
  "content": "<h2>...</h2><p>...</p>...",
  "tags": ["태그1", "태그2", ...]
}
\`\`\``;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return parseGenerateResult(text);
}

function parseGenerateResult(text: string): GenerateResult {
  // Extract JSON from markdown code block or raw text
  let jsonStr = text;
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  }

  const parsed = JSON.parse(jsonStr.trim());
  return {
    title: parsed.title,
    metaDescription: parsed.metaDescription,
    content: parsed.content,
    tags: parsed.tags,
  };
}
