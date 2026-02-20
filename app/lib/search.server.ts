import * as cheerio from "cheerio";
import { SEARCH_RESULTS_COUNT } from "./constants";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface CrawledContent {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  bodyText: string;
}

export interface AnalysisInput {
  keyword: string;
  results: CrawledContent[];
}

export async function searchWeb(keyword: string): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(keyword)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `q=${encodeURIComponent(keyword)}`,
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Search failed: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $(".result").each((_, el) => {
    if (results.length >= SEARCH_RESULTS_COUNT) return;

    const anchor = $(el).find("a.result__a").first();
    const href = anchor.attr("href") || "";
    const title = anchor.text().trim();
    const snippet = $(el).find(".result__snippet").text().trim();

    // DuckDuckGo uses redirect URLs, extract actual URL
    let actualUrl = href;
    try {
      const parsed = new URL(href, "https://duckduckgo.com");
      actualUrl = parsed.searchParams.get("uddg") || href;
    } catch {
      // use href as-is
    }

    if (actualUrl.startsWith("http") && title) {
      results.push({ title, url: actualUrl, snippet });
    }
  });

  return results;
}

export async function crawlPage(url: string): Promise<CrawledContent> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Failed to crawl ${url}: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Remove script, style, nav, footer, aside
  $("script, style, nav, footer, aside, header, iframe, noscript").remove();

  const title = $("title").first().text().trim();
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() || "";

  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const text = $(el).text().trim();
    if (text) headings.push(`${el.tagName.toUpperCase()}: ${text}`);
  });

  // Extract body text from article, main, or body
  let bodyText = "";
  const contentEl = $("article").first().length
    ? $("article").first()
    : $("main").first().length
      ? $("main").first()
      : $("body");

  bodyText = contentEl.text().replace(/\s+/g, " ").trim();

  // Limit body text length
  if (bodyText.length > 3000) {
    bodyText = bodyText.substring(0, 3000) + "...";
  }

  return { url, title, metaDescription, headings, bodyText };
}

export async function searchAndCrawl(keyword: string): Promise<AnalysisInput> {
  const searchResults = await searchWeb(keyword);

  const crawlPromises = searchResults.map(async (result) => {
    try {
      return await crawlPage(result.url);
    } catch (error) {
      console.error(`Failed to crawl ${result.url}:`, error);
      return null;
    }
  });

  const crawled = await Promise.all(crawlPromises);
  const results = crawled.filter((r): r is CrawledContent => r !== null);

  return { keyword, results };
}
