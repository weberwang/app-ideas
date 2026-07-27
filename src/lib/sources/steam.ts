import { ProxyAgent, type Dispatcher } from "undici";
import type { RawMarketProduct } from "@/lib/types";
import { normalizePublicText } from "@/lib/text";

const proxyUrl = process.env.HTTPS_PROXY
  ?? process.env.https_proxy
  ?? process.env.HTTP_PROXY
  ?? process.env.http_proxy;
const steamDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

/** Steam 商店搜索结果中的价格结构。 */
interface SteamPrice {
  currency?: string;
  initial?: number;
  final?: number;
}

/** Steam 商店关键词搜索返回的候选产品。 */
interface SteamSearchItem {
  type: string;
  id: number;
  name: string;
  tiny_image?: string;
  price?: SteamPrice;
}

/** Steam 商店搜索接口响应。 */
interface SteamSearchResponse {
  total: number;
  items?: SteamSearchItem[];
}

/** Steam 首页榜单中的候选游戏。 */
interface SteamFeaturedItem {
  id: number;
  type: number;
  name: string;
  currency?: string;
  original_price?: number | null;
  final_price?: number;
  header_image?: string;
  small_capsule_image?: string;
}

/** Steam 首页榜单响应中用于整体趋势的分类。 */
interface SteamFeaturedResponse {
  top_sellers?: { items?: SteamFeaturedItem[] };
  new_releases?: { items?: SteamFeaturedItem[] };
}

/** Steam 产品详情中需要参与分析的字段。 */
interface SteamAppDetails {
  type?: string;
  name?: string;
  is_free?: boolean;
  developers?: string[];
  publishers?: string[];
  header_image?: string;
  capsule_image?: string;
  price_overview?: SteamPrice;
  genres?: Array<{ id: string; description: string }>;
  release_date?: { coming_soon: boolean; date: string };
}

/** Steam 产品详情接口的单项包装。 */
interface SteamDetailsEnvelope {
  success: boolean;
  data?: SteamAppDetails;
}

/** Steam 评论接口的聚合统计。 */
interface SteamReviewResponse {
  success: number;
  query_summary?: {
    total_positive?: number;
    total_negative?: number;
    total_reviews?: number;
  };
}

/** 统一为 Steam 请求增加超时、缓存和运行环境代理支持。 */
async function fetchSteamJson<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const options: RequestInit & { dispatcher?: Dispatcher } = {
    signal: controller.signal,
    headers: {
      accept: "application/json",
      "user-agent": "MarketSignalLab/0.1",
    },
    next: { revalidate: 1800 },
  };
  if (steamDispatcher) options.dispatcher = steamDispatcher;

  try {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`Steam 数据源返回 ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

/** 单个补充字段失败时返回空值，避免丢弃整批关键词结果。 */
async function fetchOptionalSteamJson<T>(url: string): Promise<T | null> {
  try {
    return await fetchSteamJson<T>(url);
  } catch {
    return null;
  }
}

/** 把 Steam 英文发布日期转换为稳定的 ISO 时间。 */
function normalizeReleaseDate(value: string | undefined): string | null {
  if (!value) return null;
  // Steam 只返回英文日期文本；显式按 UTC 解析，避免服务器所在时区改变筛选边界。
  const timestamp = Date.parse(`${value} UTC`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

/** 将搜索、详情和评论统计合并为统一市场产品。 */
export function normalizeSteamProduct(
  searchItem: SteamSearchItem,
  details: SteamAppDetails,
  reviews: SteamReviewResponse | null,
): RawMarketProduct {
  const positive = reviews?.query_summary?.total_positive ?? 0;
  const negative = reviews?.query_summary?.total_negative ?? 0;
  const reviewCount = reviews?.query_summary?.total_reviews ?? positive + negative;
  const price = details.price_overview ?? searchItem.price;
  const developer = details.developers?.[0] ?? details.publishers?.[0] ?? "未知开发者";

  return {
    id: `steam-${searchItem.id}`,
    source: "steam",
    name: normalizePublicText(details.name ?? searchItem.name),
    developer: normalizePublicText(developer),
    category: normalizePublicText(details.genres?.map((genre) => genre.description).slice(0, 2).join(" / ") || "游戏"),
    url: `https://store.steampowered.com/app/${searchItem.id}`,
    iconUrl: details.capsule_image ?? details.header_image ?? searchItem.tiny_image ?? null,
    rating: reviewCount > 0 ? positive / reviewCount * 5 : null,
    reviewCount,
    price: details.is_free ? 0 : (price?.final ?? price?.initial ?? 0) / 100,
    currency: price?.currency ?? "USD",
    releasedAt: normalizeReleaseDate(details.release_date?.date),
    updatedAt: null,
    ownersLow: null,
    ownersHigh: null,
    positiveReviews: reviewCount > 0 ? positive : null,
    negativeReviews: reviewCount > 0 ? negative : null,
    averagePlaytimeMinutes: null,
  };
}

/** 并行补全一组 Steam 候选产品的详情和评论。 */
async function hydrateSteamCandidates(
  candidates: SteamSearchItem[],
  country: string,
): Promise<RawMarketProduct[]> {
  // 各候选产品相互独立，同时请求详情和评论可显著缩短整次分析等待时间。
  const products = await Promise.all(candidates.map(async (item) => {
    const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${item.id}&cc=${country.toLowerCase()}&l=english`;
    const reviewsUrl = `https://store.steampowered.com/appreviews/${item.id}?json=1&language=all&purchase_type=all&num_per_page=0`;
    const [detailsPayload, reviews] = await Promise.all([
      fetchOptionalSteamJson<Record<string, SteamDetailsEnvelope>>(detailsUrl),
      fetchOptionalSteamJson<SteamReviewResponse>(reviewsUrl),
    ]);
    const envelope = detailsPayload?.[String(item.id)];
    if (!envelope?.success || envelope.data?.type !== "game") return null;
    return normalizeSteamProduct(item, envelope.data, reviews);
  }));

  return products.filter((product): product is RawMarketProduct => product !== null);
}

/** 使用 Steam 商店公开端点按关键词搜索游戏并补全评论统计。 */
export async function searchSteamGames(query: string, country: string): Promise<RawMarketProduct[]> {
  const searchParams = new URLSearchParams({
    term: query,
    l: "english",
    cc: country.toLowerCase(),
  });
  const search = await fetchSteamJson<SteamSearchResponse>(
    `https://store.steampowered.com/api/storesearch/?${searchParams}`,
  );
  const candidates = (search.items ?? []).filter((item) => item.type === "app").slice(0, 10);
  return hydrateSteamCandidates(candidates, country);
}

/** 读取 Steam 热销与新品榜单，作为无关键词时的整体市场样本。 */
export async function loadSteamCharts(country: string): Promise<RawMarketProduct[]> {
  const params = new URLSearchParams({ cc: country.toLowerCase(), l: "english" });
  const featured = await fetchSteamJson<SteamFeaturedResponse>(
    `https://store.steampowered.com/api/featuredcategories/?${params}`,
  );
  const chartItems = [
    ...(featured.top_sellers?.items ?? []).slice(0, 10),
    ...(featured.new_releases?.items ?? []).slice(0, 10),
  ];
  const seen = new Set<number>();
  const candidates = chartItems.flatMap((item): SteamSearchItem[] => {
    if (item.type !== 0 || seen.has(item.id)) return [];
    seen.add(item.id);
    return [{
      type: "app",
      id: item.id,
      name: item.name,
      tiny_image: item.small_capsule_image ?? item.header_image,
      price: {
        currency: item.currency,
        initial: item.original_price ?? undefined,
        final: item.final_price,
      },
    }];
  });

  return hydrateSteamCandidates(candidates, country);
}
