import { ProxyAgent, type Dispatcher } from "undici";
import { daysForPeriod } from "@/lib/period";
import type {
  AnalysisPeriod,
  AnalysisRequest,
  KeywordHeatPoint,
  KeywordHeatSummary,
} from "@/lib/types";

const pageviewsStart = Date.UTC(2015, 6, 1);
const dayMs = 86_400_000;
const requestTimeoutMs = 15_000;
const maximumSeriesPoints = 40;
const proxyUrl = process.env.HTTPS_PROXY
  ?? process.env.https_proxy
  ?? process.env.HTTP_PROXY
  ?? process.env.http_proxy;
const proxyDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

const countryLanguages: Record<string, string> = {
  CN: "zh",
  DE: "de",
  GB: "en",
  JP: "ja",
  US: "en",
};

/** 热度采集的可注入依赖，便于固定时间和隔离外部请求测试。 */
export interface KeywordHeatOptions {
  now?: number;
  fetcher?: typeof fetch;
}

/** Wikimedia 搜索结果中的最小可信字段。 */
interface SearchResult {
  title: string;
}

/** Wikimedia Pageviews 返回的已校验原始点。 */
interface RawPageviewPoint {
  timestamp: string;
  views: number;
}

/** 返回国家对应的 Wikipedia 语言站，未知国家使用英文站。 */
function languageForCountry(country: string): string {
  return countryLanguages[country.toUpperCase()] ?? "en";
}

/** 将 UTC 时间格式化为 Wikimedia API 日期。 */
function apiDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10).replaceAll("-", "");
}

/** 将 YYYYMMDD 日期转换为固定 UTC ISO 时间。 */
function isoDate(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`;
}

/** 计算所选时间范围，并避开尚未完整结算的当天数据。 */
function periodRange(period: AnalysisPeriod, now: number): {
  start: number;
  end: number;
  granularity: "daily" | "monthly";
} {
  const today = new Date(now);
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - dayMs;
  if (period === "all") {
    return { start: pageviewsStart, end, granularity: "monthly" };
  }
  return { start: end - (daysForPeriod(period) - 1) * dayMs, end, granularity: "daily" };
}

/** 带超时读取 JSON，错误只暴露稳定状态而不泄漏上游响应内容。 */
async function requestJson(fetcher: typeof fetch, url: string, notFoundValue?: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const options: RequestInit & { dispatcher?: Dispatcher } = {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "MarketSignalLab/0.1 (https://github.com/weberwang/app-ideas)",
      },
    };
    if (proxyDispatcher && fetcher === fetch) options.dispatcher = proxyDispatcher;
    const response = await fetcher(url, options);
    if (response.status === 404 && notFoundValue !== undefined) return notFoundValue;
    if (!response.ok) {
      throw new Error(response.status === 429 ? "Wikimedia 数据源限流" : `Wikimedia 数据源返回 ${response.status}`);
    }
    return await response.json() as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/** 从 MediaWiki Search 响应中提取最相关百科条目。 */
function parseSearchResult(value: unknown): SearchResult | null {
  if (!value || typeof value !== "object") return null;
  const query = (value as Record<string, unknown>).query;
  if (!query || typeof query !== "object") return null;
  const search = (query as Record<string, unknown>).search;
  if (!Array.isArray(search) || search.length === 0) return null;
  const title = search[0] && typeof search[0] === "object"
    ? (search[0] as Record<string, unknown>).title
    : null;
  return typeof title === "string" && title.trim() ? { title: title.trim() } : null;
}

/** 严格过滤 Pageviews 点，非法、越界或重复数据不会进入指标。 */
function parsePageviews(value: unknown, start: number, end: number): RawPageviewPoint[] {
  if (!value || typeof value !== "object") return [];
  const items = (value as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  const byTimestamp = new Map<string, RawPageviewPoint>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.timestamp !== "string" || !/^\d{10}$/.test(record.timestamp)) continue;
    if (!Number.isSafeInteger(record.views) || (record.views as number) < 0) continue;
    const dateKey = record.timestamp.slice(0, 8);
    const timestamp = Date.parse(isoDate(dateKey));
    if (!Number.isFinite(timestamp) || apiDate(timestamp) !== dateKey || timestamp < start || timestamp > end) continue;
    byTimestamp.set(record.timestamp, { timestamp: record.timestamp, views: record.views as number });
  }
  return [...byTimestamp.values()].toSorted((left, right) => left.timestamp.localeCompare(right.timestamp));
}

/** 生成完整日/月键，Wikimedia 省略的零值日期会被明确补零。 */
function expectedKeys(start: number, end: number, granularity: "daily" | "monthly"): string[] {
  const keys: string[] = [];
  if (granularity === "daily") {
    for (let cursor = start; cursor <= end; cursor += dayMs) keys.push(apiDate(cursor));
    return keys;
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  for (
    let cursor = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1);
    cursor <= Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1);
    cursor = Date.UTC(new Date(cursor).getUTCFullYear(), new Date(cursor).getUTCMonth() + 1, 1)
  ) {
    keys.push(apiDate(cursor).slice(0, 6));
  }
  return keys;
}

/** 均匀压缩序列并保留首尾，避免长时间范围只展示最近数据。 */
export function sampleKeywordHeat(points: KeywordHeatPoint[], limit = maximumSeriesPoints): KeywordHeatPoint[] {
  if (points.length <= limit) return points;
  if (limit <= 1) return points.slice(-1);
  return Array.from({ length: limit }, (_, index) => (
    points[Math.round(index * (points.length - 1) / (limit - 1))]
  ));
}

/** 将页面浏览量转换为可展示的相对热度和涨跌指标。 */
export function summarizeKeywordHeat(
  keyword: string,
  article: SearchResult,
  language: string,
  rawPoints: RawPageviewPoint[],
  range: ReturnType<typeof periodRange>,
): KeywordHeatSummary {
  const values = new Map(rawPoints.map((point) => [
    range.granularity === "daily" ? point.timestamp.slice(0, 8) : point.timestamp.slice(0, 6),
    point.views,
  ]));
  const keys = expectedKeys(range.start, range.end, range.granularity);
  const views = keys.map((key) => values.get(key) ?? 0);
  const peakViews = Math.max(0, ...views);
  const fullSeries = keys.map((key, index) => ({
    capturedAt: range.granularity === "daily" ? isoDate(key) : isoDate(`${key}01`),
    views: views[index],
    value: peakViews === 0 ? 0 : Math.round(views[index] / peakViews * 100),
  }));
  const comparisonWindow = range.granularity === "daily" ? 7 : 3;
  const current = views.slice(-comparisonWindow);
  const previous = views.slice(-comparisonWindow * 2, -comparisonWindow);
  const currentAverage = current.length > 0 ? current.reduce((total, value) => total + value, 0) / current.length : 0;
  const previousAverage = previous.length === comparisonWindow
    ? previous.reduce((total, value) => total + value, 0) / previous.length
    : null;
  const changeRate = previousAverage !== null && previousAverage > 0
    ? (currentAverage - previousAverage) / previousAverage
    : null;
  const encodedTitle = encodeURIComponent(article.title.replaceAll(" ", "_"));
  const totalViews = views.reduce((total, value) => total + value, 0);

  return {
    keyword,
    status: "ready",
    score: peakViews === 0 ? 0 : Math.round(currentAverage / peakViews * 100),
    averageViews: views.length > 0 ? Math.round(totalViews / views.length) : 0,
    totalViews,
    changeRate,
    comparisonDate: previous.length === comparisonWindow
      ? fullSeries.at(-comparisonWindow * 2)?.capturedAt ?? null
      : null,
    granularity: range.granularity,
    articleTitle: article.title,
    articleUrl: `https://${language}.wikipedia.org/wiki/${encodedTitle}`,
    series: sampleKeywordHeat(fullSeries),
    note: `基于 ${language}.wikipedia.org 词条浏览量的公开关注代理，不代表搜索量或指定国家的访问量。`,
  };
}

/** 采集任意关键词的 Wikimedia 公开关注热度，失败时不阻断主体市场分析。 */
export async function collectKeywordHeat(
  input: Pick<AnalysisRequest, "query" | "country" | "period">,
  options: KeywordHeatOptions = {},
): Promise<KeywordHeatSummary> {
  const keyword = input.query.trim();
  if (!keyword) {
    return {
      keyword: "",
      status: "skipped",
      score: null,
      averageViews: null,
      totalViews: null,
      changeRate: null,
      comparisonDate: null,
      granularity: input.period === "all" ? "monthly" : "daily",
      articleTitle: null,
      articleUrl: null,
      series: [],
      note: "输入关键词后采集公开关注热度。",
    };
  }

  const language = languageForCountry(input.country);
  const range = periodRange(input.period, options.now ?? Date.now());
  const fetcher = options.fetcher ?? fetch;
  try {
    const searchParams = new URLSearchParams({
      action: "query",
      format: "json",
      list: "search",
      srnamespace: "0",
      srlimit: "1",
      srsearch: keyword,
      utf8: "1",
    });
    const search = parseSearchResult(await requestJson(
      fetcher,
      `https://${language}.wikipedia.org/w/api.php?${searchParams}`,
    ));
    if (!search) throw new Error("没有找到匹配的 Wikipedia 词条");

    const project = `${language}.wikipedia.org`;
    const article = encodeURIComponent(search.title.replaceAll(" ", "_"));
    const pageviewsUrl = [
      "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article",
      encodeURIComponent(project),
      "all-access",
      "user",
      article,
      range.granularity,
      apiDate(range.start),
      apiDate(range.end),
    ].join("/");
    // Wikimedia 以 404 表示零浏览量或数据尚未装载，不能将它误报为请求故障。
    const rawPoints = parsePageviews(await requestJson(fetcher, pageviewsUrl, { items: [] }), range.start, range.end);
    return summarizeKeywordHeat(keyword, search, language, rawPoints, range);
  } catch (error) {
    return {
      keyword,
      status: "unavailable",
      score: null,
      averageViews: null,
      totalViews: null,
      changeRate: null,
      comparisonDate: null,
      granularity: range.granularity,
      articleTitle: null,
      articleUrl: null,
      series: [],
      note: error instanceof Error && error.name === "AbortError"
        ? "关键词热度数据源请求超时"
        : error instanceof Error ? error.message : "关键词热度采集失败",
    };
  }
}
