import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { daysForPeriod } from "@/lib/period";
import type {
  AnalysisPeriod,
  MarketSource,
  ProductTrend,
  RawMarketProduct,
  TrendPoint,
  TrendSummary,
} from "@/lib/types";

const snapshotDirectory = resolve(process.cwd(), "data", "market-snapshots");
const minimumHistoryMs = 6 * 60 * 60 * 1_000;
const snapshotIntervalMs = 60 * 60 * 1_000;
const maxSnapshots = 400;

/** 可用于纯趋势比较的历史产品指标。 */
export interface HistoricalProductMetrics {
  reviewCount: number;
  rating: number | null;
  position: number;
}

/** 单次查询的历史快照。 */
interface MarketSnapshot {
  capturedAt: string;
  products: Record<string, HistoricalProductMetrics>;
}

/** 趋势追踪输入。 */
interface TrendTrackingInput {
  query: string;
  source: MarketSource;
  country: string;
  period: AnalysisPeriod;
}

/** 趋势追踪输出。 */
export interface TrendTrackingResult {
  products: Array<RawMarketProduct & { trend: ProductTrend }>;
  summary: TrendSummary;
}

/** 把数值限制在指定区间。 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 返回数值数组中位数。 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** 使用查询条件哈希生成安全且稳定的快照文件名。 */
function snapshotFile(input: TrendTrackingInput): string {
  const identity = `${input.query.toLowerCase()}|${input.source}|${input.country.toUpperCase()}`;
  const digest = createHash("sha256").update(identity).digest("hex").slice(0, 24);
  return join(snapshotDirectory, `${digest}.json`);
}

/** 读取历史快照，损坏或不存在时按空历史处理。 */
async function readSnapshots(filePath: string): Promise<MarketSnapshot[]> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as MarketSnapshot[]) : [];
  } catch {
    return [];
  }
}

/** 将当前产品转换为轻量快照，避免持久化不必要字段。 */
function createSnapshot(products: RawMarketProduct[], capturedAt: string): MarketSnapshot {
  return {
    capturedAt,
    products: Object.fromEntries(products.map((product, position) => [
      product.id,
      { reviewCount: product.reviewCount, rating: product.rating, position: position + 1 },
    ])),
  };
}

/** 找到最接近时间范围起点的历史快照。 */
function selectComparison(
  snapshots: MarketSnapshot[],
  period: AnalysisPeriod,
  now: number,
): MarketSnapshot | null {
  const eligible = snapshots.filter((snapshot) => now - Date.parse(snapshot.capturedAt) >= minimumHistoryMs);
  if (eligible.length === 0) return null;
  const target = now - daysForPeriod(period) * 86_400_000;
  return eligible.reduce((closest, snapshot) => {
    const currentDistance = Math.abs(Date.parse(snapshot.capturedAt) - target);
    const closestDistance = Math.abs(Date.parse(closest.capturedAt) - target);
    return currentDistance < closestDistance ? snapshot : closest;
  });
}

/** 根据一组历史指标计算产品趋势，供快照流程和单元测试复用。 */
export function deriveProductTrend(
  product: RawMarketProduct,
  position: number,
  previous: HistoricalProductMetrics | null,
  comparisonDate: string | null,
): ProductTrend {
  if (!comparisonDate) {
    return { direction: "unknown", reviewDelta: null, ratingDelta: null, rankDelta: null, reviewGrowthRate: null, comparisonDate: null };
  }
  if (!previous) {
    return { direction: "new", reviewDelta: null, ratingDelta: null, rankDelta: null, reviewGrowthRate: null, comparisonDate };
  }

  const reviewDelta = product.reviewCount - previous.reviewCount;
  const ratingDelta = product.rating === null || previous.rating === null ? null : product.rating - previous.rating;
  const rankDelta = previous.position - position;
  const reviewGrowthRate = previous.reviewCount > 0 ? reviewDelta / previous.reviewCount : null;
  const meaningfulGrowth = Math.max(10, previous.reviewCount * 0.02);
  const direction = rankDelta >= 3 || reviewDelta >= meaningfulGrowth
    ? "up"
    : rankDelta <= -3 && reviewDelta < meaningfulGrowth
      ? "down"
      : "stable";

  return {
    direction,
    reviewDelta,
    ratingDelta,
    rankDelta,
    reviewGrowthRate,
    comparisonDate,
  };
}

/** 从历史快照中读取产品指标并计算趋势。 */
function compareProduct(
  product: RawMarketProduct,
  position: number,
  comparison: MarketSnapshot | null,
): ProductTrend {
  return deriveProductTrend(
    product,
    position,
    comparison?.products[product.id] ?? null,
    comparison?.capturedAt ?? null,
  );
}

/** 将快照压缩为趋势图采样点。 */
function snapshotPoint(snapshot: MarketSnapshot): TrendPoint {
  const products = Object.values(snapshot.products);
  const ratings = products.flatMap((product) => (product.rating === null ? [] : [product.rating]));
  return {
    capturedAt: snapshot.capturedAt,
    medianReviews: Math.round(median(products.map((product) => product.reviewCount))),
    averageRating: ratings.length > 0
      ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
      : null,
    sampleSize: products.length,
  };
}

/** 原子写入快照，并限制历史文件持续增长。 */
async function saveSnapshots(filePath: string, snapshots: MarketSnapshot[]): Promise<void> {
  await mkdir(snapshotDirectory, { recursive: true });
  const trimmed = snapshots.slice(-maxSnapshots);
  const temporaryFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(trimmed)}\n`, "utf8");
  await rename(temporaryFile, filePath);
}

/** 计算趋势并保存当前快照；持久化失败不会阻断主体分析。 */
export async function trackProductTrends(
  input: TrendTrackingInput,
  products: RawMarketProduct[],
  now = Date.now(),
): Promise<TrendTrackingResult> {
  const filePath = snapshotFile(input);
  const snapshots = await readSnapshots(filePath);
  const capturedAt = new Date(now).toISOString();
  const currentSnapshot = createSnapshot(products, capturedAt);
  const comparison = selectComparison(snapshots, input.period, now);
  const enrichedProducts = products.map((product, index) => ({
    ...product,
    trend: compareProduct(product, index + 1, comparison),
  }));

  const directions = enrichedProducts.map((product) => product.trend.direction);
  const periodCutoff = now - daysForPeriod(input.period) * 86_400_000;
  const visibleHistory = input.period === "all"
    ? snapshots
    : snapshots.filter((snapshot) => Date.parse(snapshot.capturedAt) >= periodCutoff);
  const seriesSnapshots = [...visibleHistory, currentSnapshot];
  const deduplicatedSeries = seriesSnapshots.filter(
    (snapshot, index) => index === 0 || snapshot.capturedAt !== seriesSnapshots[index - 1].capturedAt,
  );
  const historyDays = comparison
    ? clamp(Math.round((now - Date.parse(comparison.capturedAt)) / 86_400_000), 0, 10_000)
    : 0;

  const lastSnapshot = snapshots.at(-1);
  const nextSnapshots = lastSnapshot && now - Date.parse(lastSnapshot.capturedAt) < snapshotIntervalMs
    ? [...snapshots.slice(0, -1), currentSnapshot]
    : [...snapshots, currentSnapshot];
  try {
    await saveSnapshots(filePath, nextSnapshots);
  } catch {
    // 只读部署仍可返回当前分析，趋势会明确显示为未积累。
  }

  return {
    products: enrichedProducts,
    summary: {
      hasHistory: comparison !== null,
      comparisonDate: comparison?.capturedAt ?? null,
      historyDays,
      risingCount: directions.filter((direction) => direction === "up").length,
      fallingCount: directions.filter((direction) => direction === "down").length,
      stableCount: directions.filter((direction) => direction === "stable").length,
      newCount: directions.filter((direction) => direction === "new").length,
      series: deduplicatedSeries.slice(-30).map(snapshotPoint),
    },
  };
}
