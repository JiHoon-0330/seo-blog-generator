import { useState, useEffect, useMemo } from "react";
import { marked } from "marked";
import { Form, useActionData, useLoaderData, useNavigation, useFetcher } from "react-router";
import type { Route } from "./+types/_index";
import { searchAndCrawl } from "~/lib/search.server";
import { analyzeCompetitors, generateSEOContent, regenerateWithFeedback } from "~/lib/gemini.server";
import { createSession, saveGeneration, updateFeedback, getSession, getGenerationCount, getKeywordHistory } from "~/lib/db.server";
import { setStatus, clearStatus, getStatus } from "~/lib/status.server";
import { MAX_REGENERATIONS } from "~/lib/constants";

const STEP_LABELS: Record<string, string> = {
  searching: "검색 중",
  crawling: "크롤링 중",
  analyzing: "분석 중",
  generating: "생성 중",
};

export function loader() {
  const history = getKeywordHistory();
  return { history };
}

export function meta() {
  return [
    { title: "SEO 블로그 콘텐츠 생성기" },
    { name: "description", content: "SEO 최적화 블로그 콘텐츠를 AI로 자동 생성합니다." },
  ];
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "generate") {
    const keyword = formData.get("keyword") as string;
    if (!keyword?.trim()) {
      return { error: "키워드를 입력해주세요." };
    }

    const status = getStatus();
    if (status.active) {
      return { error: `현재 '${status.keyword}' 키워드로 콘텐츠를 생성 중입니다. 완료 후 다시 시도해주세요.` };
    }

    try {
      setStatus(keyword.trim(), "searching");
      const crawledData = await searchAndCrawl(keyword.trim());

      if (crawledData.results.length === 0) {
        clearStatus();
        return { error: "검색 결과를 크롤링하지 못했습니다. 다시 시도해주세요." };
      }

      setStatus(keyword.trim(), "analyzing");
      const analysis = await analyzeCompetitors(crawledData);

      setStatus(keyword.trim(), "generating");
      const result = await generateSEOContent(keyword.trim(), analysis);

      const sessionId = createSession(
        keyword.trim(),
        JSON.stringify(crawledData.results.map((r) => ({ url: r.url, title: r.title }))),
        analysis
      );
      const genId = saveGeneration(sessionId, 1, result);

      clearStatus();
      return {
        sessionId,
        generationId: genId,
        result,
        analysis,
        version: 1,
        keyword: keyword.trim(),
      };
    } catch (error) {
      clearStatus();
      console.error("Generation error:", error);
      return { error: `콘텐츠 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}` };
    }
  }

  if (intent === "regenerate") {
    const sessionId = formData.get("sessionId") as string;
    const generationId = Number(formData.get("generationId"));
    const rating = formData.get("rating") as string;
    const feedback = formData.get("feedback") as string;

    if (!sessionId) return { error: "세션 정보가 없습니다." };

    try {
      const count = getGenerationCount(sessionId);
      if (count >= MAX_REGENERATIONS + 1) {
        return { error: `최대 재생성 횟수(${MAX_REGENERATIONS}회)를 초과했습니다.` };
      }

      updateFeedback(generationId, rating || "bad", feedback || "");

      const session = getSession(sessionId);
      if (!session) return { error: "세션을 찾을 수 없습니다." };

      const newVersion = count + 1;

      setStatus(session.keyword, "generating");
      const result = await regenerateWithFeedback(
        session.keyword,
        session.analysis || "",
        session.generations
      );

      const newGenId = saveGeneration(sessionId, newVersion, result);

      clearStatus();
      return {
        sessionId,
        generationId: newGenId,
        result,
        analysis: session.analysis,
        version: newVersion,
        keyword: session.keyword,
        maxReached: newVersion > MAX_REGENERATIONS,
      };
    } catch (error) {
      clearStatus();
      console.error("Regeneration error:", error);
      return { error: `재생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}` };
    }
  }

  if (intent === "load") {
    const sessionId = formData.get("sessionId") as string;
    if (!sessionId) return { error: "세션 정보가 없습니다." };

    const session = getSession(sessionId);
    if (!session) return { error: "세션을 찾을 수 없습니다." };

    const latest = session.generations[session.generations.length - 1];
    if (!latest) return { error: "생성된 콘텐츠가 없습니다." };

    return {
      sessionId,
      generationId: latest.id,
      result: {
        title: latest.title,
        metaDescription: latest.meta_description,
        content: latest.content,
        tags: JSON.parse(latest.tags),
      },
      analysis: session.analysis,
      version: latest.version,
      keyword: session.keyword,
      maxReached: latest.version > MAX_REGENERATIONS,
    };
  }

  return { error: "알 수 없는 요청입니다." };
}

export default function Index() {
  const { history } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const generateFetcher = useFetcher();
  const regenerateFetcher = useFetcher();

  const isLoadingArticle = navigation.state === "submitting" &&
    (navigation.formData as FormData | undefined)?.get("intent") === "load";

  const isGenerating = generateFetcher.state === "submitting";
  const isRegenerating = regenerateFetcher.state === "submitting";
  const isBusy = isGenerating || isRegenerating;

  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [rating, setRating] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [remoteStatus, setRemoteStatus] = useState<{
    active: boolean;
    keyword?: string;
    step?: string;
  } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    async function pollStatus() {
      try {
        const res = await fetch("/api/status");
        if (res.ok) {
          const data = await res.json();
          setRemoteStatus(data);
        }
      } catch {
        // ignore fetch errors
      }
    }

    pollStatus();
    timer = setInterval(pollStatus, 3000);

    return () => clearInterval(timer);
  }, []);

  const isRemoteBusy = remoteStatus?.active && !isBusy;

  type ActionResult = {
    error?: string;
    sessionId?: string;
    generationId?: number;
    result?: { title: string; metaDescription: string; content: string; tags: string[] };
    analysis?: string;
    version?: number;
    keyword?: string;
    maxReached?: boolean;
  };

  // Merge data from fetchers and action (load)
  // Priority: regenerate result > generate result > load result
  const fetcherData = (regenerateFetcher.data ?? generateFetcher.data ?? actionData) as ActionResult | undefined;
  const data = fetcherData;

  // Reset rating/feedback when new generation arrives
  useEffect(() => {
    if (data?.result && data?.version) {
      setRating(null);
      setFeedbackText("");
    }
  }, [data?.version, data?.sessionId]);

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage(`${label} 복사됨!`);
      setTimeout(() => setCopyMessage(""), 2000);
    } catch {
      setCopyMessage("복사 실패");
      setTimeout(() => setCopyMessage(""), 2000);
    }
  }

  const analysisHtml = useMemo(() => {
    if (!data?.analysis) return "";
    return marked(data.analysis) as string;
  }, [data?.analysis]);

  const canRegenerate =
    data?.result && !data?.maxReached && (data?.version ?? 0) <= MAX_REGENERATIONS;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
          SEO 블로그 콘텐츠 생성기
        </h1>
        <p className="text-center text-gray-500 mb-10">
          타겟 키워드를 입력하면 상위 노출 게시글을 분석하여 SEO 최적화 블로그 글을 생성합니다.
        </p>

        {/* Remote generation banner */}
        {isRemoteBusy && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin flex-shrink-0"></div>
            <p className="text-amber-800">
              현재 '<span className="font-semibold">{remoteStatus.keyword}</span>' 콘텐츠 생성 중... ({STEP_LABELS[remoteStatus.step!] || remoteStatus.step})
            </p>
          </div>
        )}

        {/* Generation loading banner */}
        {isBusy && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin flex-shrink-0"></div>
            <div>
              <p className="text-blue-800 font-medium">
                {isGenerating ? "AI가 콘텐츠를 생성하고 있습니다..." : "피드백을 반영하여 재생성 중..."}
              </p>
              <p className="text-blue-600 text-sm mt-0.5">
                검색 → 크롤링 → 분석 → 생성 (1~2분 소요)
              </p>
            </div>
          </div>
        )}

        {/* Keyword Input */}
        <generateFetcher.Form method="post" className="mb-10">
          <input type="hidden" name="intent" value="generate" />
          <div className="flex gap-3">
            <input
              type="text"
              name="keyword"
              placeholder="SEO 타겟 키워드를 입력하세요"
              defaultValue={data?.keyword || ""}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isBusy || !!isRemoteBusy}
              required
            />
            <button
              type="submit"
              disabled={isBusy || !!isRemoteBusy}
              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? "생성 중..." : "콘텐츠 생성하기"}
            </button>
          </div>
        </generateFetcher.Form>

        {/* History */}
        {history.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 mb-10 overflow-hidden">
            <h2 className="text-lg font-semibold text-gray-800 px-6 py-4 border-b border-gray-100">
              생성 히스토리
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-left">
                    <th className="px-6 py-3 font-medium">키워드</th>
                    <th className="px-6 py-3 font-medium">생성 횟수</th>
                    <th className="px-6 py-3 font-medium">최신 제목</th>
                    <th className="px-6 py-3 font-medium">생성일</th>
                    <th className="px-6 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((item) => (
                    <tr key={item.keyword} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {item.keyword}
                        {item.sessionCount > 1 && (
                          <span className="ml-1 text-xs text-gray-500">({item.sessionCount}회)</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-600">{item.sessionCount}</td>
                      <td className="px-6 py-3 text-gray-700 max-w-xs truncate">{item.latestTitle}</td>
                      <td className="px-6 py-3 text-gray-500">{item.latestDate}</td>
                      <td className="px-6 py-3">
                        <Form method="post" className="inline">
                          <input type="hidden" name="intent" value="load" />
                          <input type="hidden" name="sessionId" value={item.sessions[0].id} />
                          <button
                            type="submit"
                            disabled={isLoadingArticle}
                            className="text-blue-600 hover:text-blue-800 font-medium text-sm disabled:text-gray-400"
                          >
                            불러오기
                          </button>
                        </Form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {history.length === 0 && !isBusy && !data?.result && (
          <p className="text-center text-gray-400 mb-10">아직 생성된 콘텐츠가 없습니다</p>
        )}

        {/* Error */}
        {data?.error && !isBusy && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <p className="text-red-700">{data.error}</p>
          </div>
        )}

        {/* Copy toast */}
        {copyMessage && (
          <div className="fixed top-4 right-4 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in">
            {copyMessage}
          </div>
        )}

        {/* Results */}
        {data?.result && (
          <div className="space-y-8">
            {/* Analysis Section */}
            {data.analysis && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setAnalysisOpen(!analysisOpen)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <h2 className="text-lg font-semibold text-gray-800">
                    경쟁사 분석 결과
                  </h2>
                  <svg
                    className={`w-5 h-5 text-gray-500 transition-transform ${analysisOpen ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {analysisOpen && (
                  <div className="px-6 pb-4 border-t border-gray-100">
                    <div
                      className="prose prose-sm max-w-none mt-4 text-gray-700"
                      dangerouslySetInnerHTML={{ __html: analysisHtml }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Version Badge */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500">
                버전 {data.version}/{MAX_REGENERATIONS + 1}
              </span>
              {data.maxReached && (
                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                  최대 재생성 횟수 도달
                </span>
              )}
            </div>

            {/* SEO Meta Info */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">SEO 메타 정보</h2>
                <button
                  onClick={() =>
                    copyToClipboard(
                      `제목: ${data.result!.title}\n메타 디스크립션: ${data.result!.metaDescription}`,
                      "메타 정보"
                    )
                  }
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  복사
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-gray-500">제목</span>
                  <p className="text-gray-900 font-medium mt-1">{data.result.title}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500">메타 디스크립션</span>
                  <p className="text-gray-700 mt-1">{data.result.metaDescription}</p>
                </div>
              </div>
            </div>

            {/* Content Preview */}
            <div className="bg-white rounded-lg border border-gray-200 p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-800">본문 미리보기</h2>
                <button
                  onClick={() => copyToClipboard(data.result!.content, "HTML")}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  HTML 복사
                </button>
              </div>
              <div
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: data.result.content }}
              />
            </div>

            {/* Tags */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">추천 태그</h2>
              <div className="flex flex-wrap gap-2">
                {data.result.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Feedback & Regenerate */}
            {canRegenerate && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">
                  피드백 & 재생성
                </h2>
                <regenerateFetcher.Form method="post">
                  <input type="hidden" name="intent" value="regenerate" />
                  <input type="hidden" name="sessionId" value={data.sessionId} />
                  <input type="hidden" name="generationId" value={data.generationId} />
                  <input type="hidden" name="rating" value={rating || ""} />

                  <div className="flex gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => setRating("good")}
                      className={`flex-1 py-3 rounded-lg border-2 font-medium transition-colors ${
                        rating === "good"
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-gray-200 text-gray-600 hover:border-green-300"
                      }`}
                    >
                      👍 좋아요
                    </button>
                    <button
                      type="button"
                      onClick={() => setRating("bad")}
                      className={`flex-1 py-3 rounded-lg border-2 font-medium transition-colors ${
                        rating === "bad"
                          ? "border-red-500 bg-red-50 text-red-700"
                          : "border-gray-200 text-gray-600 hover:border-red-300"
                      }`}
                    >
                      👎 아쉬워요
                    </button>
                  </div>

                  <textarea
                    name="feedback"
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="개선할 점이나 원하는 방향을 알려주세요..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                  />

                  <button
                    type="submit"
                    disabled={isBusy || !rating || !!isRemoteBusy}
                    className="mt-4 w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    {isRegenerating
                      ? "재생성 중..."
                      : `피드백 반영하여 재생성 (${data.version}/${MAX_REGENERATIONS + 1}회)`}
                  </button>
                </regenerateFetcher.Form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
