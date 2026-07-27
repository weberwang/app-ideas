import type { AnalysisPeriod, RawMarketProduct } from "@/lib/types";

const periodDaysMap: Record<Exclude<AnalysisPeriod, "all">, number> = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
};

/** 返回有限时间范围对应的天数。 */
export function daysForPeriod(period: Exclude<AnalysisPeriod, "all">): number {
  return periodDaysMap[period];
}

/** 判断日期是否在指定观察窗口内。 */
function dateIsWithin(value: string | null, cutoff: number, now: number): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now;
}

/** 按首次发布或最近更新时间筛选活跃产品。 */
export function filterProductsByPeriod(
  products: RawMarketProduct[],
  period: AnalysisPeriod,
  now = Date.now(),
): RawMarketProduct[] {
  if (period === "all") return products;
  const cutoff = now - daysForPeriod(period) * 86_400_000;
  return products.filter(
    (product) => dateIsWithin(product.releasedAt, cutoff, now) || dateIsWithin(product.updatedAt, cutoff, now),
  );
}
