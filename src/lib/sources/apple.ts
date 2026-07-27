import type { RawMarketProduct } from "@/lib/types";
import { normalizePublicText } from "@/lib/text";

/** Apple Search API 返回的软件字段。 */
interface AppleSoftwareResult {
  trackId: number;
  trackName: string;
  artistName: string;
  primaryGenreName?: string;
  trackViewUrl?: string;
  artworkUrl100?: string;
  averageUserRating?: number;
  userRatingCount?: number;
  price?: number;
  currency?: string;
  releaseDate?: string;
  currentVersionReleaseDate?: string;
  genres?: string[];
}

/** Apple Search API 顶层响应。 */
interface AppleSearchResponse {
  resultCount: number;
  results: AppleSoftwareResult[];
}

/** Apple 官方榜单中的产品标识。 */
interface AppleChartEntry {
  id: { attributes: { "im:id": string } };
}

/** Apple 官方榜单响应。 */
interface AppleChartResponse {
  feed: { entry?: AppleChartEntry[] };
}

/** 带超时访问公开接口，防止单个数据源拖住整次分析。 */
async function fetchWithTimeout(url: string, timeoutMs = 8_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "MarketSignalLab/0.1" },
      next: { revalidate: 1800 },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** 过滤 App/游戏并转换为统一产品结构。 */
function normalizeAppleProducts(
  items: AppleSoftwareResult[],
  kind: "apps" | "games",
): RawMarketProduct[] {
  return items.flatMap((item) => {
    const isGame = item.primaryGenreName === "Games" || item.genres?.includes("Games");
    if (kind === "games" ? !isGame : isGame) return [];
    return [{
      id: `${kind}-${item.trackId}`,
      source: kind,
      name: normalizePublicText(item.trackName),
      developer: normalizePublicText(item.artistName),
      category: normalizePublicText(item.primaryGenreName ?? "未知分类"),
      url: item.trackViewUrl ?? `https://apps.apple.com/app/id${item.trackId}`,
      iconUrl: item.artworkUrl100?.replace("100x100", "200x200") ?? null,
      rating: (item.userRatingCount ?? 0) > 0 ? (item.averageUserRating ?? null) : null,
      reviewCount: item.userRatingCount ?? 0,
      price: item.price ?? 0,
      currency: item.currency ?? "USD",
      releasedAt: item.releaseDate ?? null,
      updatedAt: item.currentVersionReleaseDate ?? null,
      ownersLow: null,
      ownersHigh: null,
      positiveReviews: null,
      negativeReviews: null,
      averagePlaytimeMinutes: null,
    } satisfies RawMarketProduct];
  });
}

/** 使用 Apple 官方 Search API 搜索 App Store 软件。 */
export async function searchAppleApps(
  query: string,
  country: string,
  kind: "apps" | "games",
): Promise<RawMarketProduct[]> {
  const params = new URLSearchParams({
    term: kind === "games" ? `${query} game` : query,
    country: country.toLowerCase(),
    media: "software",
    entity: "software",
    limit: "100",
  });
  const response = await fetchWithTimeout(`https://itunes.apple.com/search?${params}`);
  if (!response.ok) throw new Error(`Apple 数据源返回 ${response.status}`);

  const payload = (await response.json()) as AppleSearchResponse;
  return normalizeAppleProducts(payload.results, kind);
}

/** 读取 Apple 免费与付费榜单，并通过 Lookup API 补全评分和更新时间。 */
export async function loadAppleCharts(
  country: string,
  kind: "apps" | "games",
): Promise<RawMarketProduct[]> {
  const storefront = country.toLowerCase();
  const genrePath = kind === "games" ? "/genre=6014" : "";
  const chartUrls = ["topfreeapplications", "toppaidapplications"].map(
    (chart) => `https://itunes.apple.com/${storefront}/rss/${chart}/limit=25${genrePath}/json`,
  );
  const chartResponses = await Promise.all(chartUrls.map((url) => fetchWithTimeout(url)));
  const charts = await Promise.all(chartResponses.map(async (response) => {
    if (!response.ok) throw new Error(`Apple 榜单返回 ${response.status}`);
    return await response.json() as AppleChartResponse;
  }));
  const ids = [...new Set(charts.flatMap((chart) => (
    chart.feed.entry ?? []).map((entry) => entry.id.attributes["im:id"])
  ))];
  if (ids.length === 0) return [];

  const params = new URLSearchParams({ id: ids.join(","), country: storefront });
  const lookupResponse = await fetchWithTimeout(`https://itunes.apple.com/lookup?${params}`);
  if (!lookupResponse.ok) throw new Error(`Apple Lookup 数据源返回 ${lookupResponse.status}`);
  const lookup = await lookupResponse.json() as AppleSearchResponse;
  const byId = new Map(lookup.results.map((item) => [String(item.trackId), item]));

  // 保留榜单顺序，后续快照才能把真实排名变化转换为趋势信号。
  return normalizeAppleProducts(
    ids.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []),
    kind,
  );
}
