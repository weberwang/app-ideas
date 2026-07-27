import { describe, expect, it } from "vitest";
import { buildAnalysisResult, calculateMetrics, scoreProduct } from "@/lib/scoring";
import { filterProductsByPeriod } from "@/lib/period";
import { deriveProductTrend } from "@/lib/trends";
import type { RawMarketProduct } from "@/lib/types";

/** 创建测试产品，允许按场景覆盖公开数据信号。 */
function product(overrides: Partial<RawMarketProduct> = {}): RawMarketProduct {
  return {
    id: "apps-1",
    source: "apps",
    name: "测试产品",
    developer: "测试开发者",
    category: "效率",
    url: "https://example.com",
    iconUrl: null,
    rating: 4.2,
    reviewCount: 500,
    price: 4.99,
    currency: "USD",
    releasedAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ownersLow: null,
    ownersHigh: null,
    positiveReviews: null,
    negativeReviews: null,
    averagePlaytimeMinutes: null,
    ...overrides,
  };
}

describe("市场评分", () => {
  it("高需求且低满意度的产品应获得更高痛点分", () => {
    const satisfied = scoreProduct(product({ rating: 4.9, reviewCount: 20_000 }));
    const dissatisfied = scoreProduct(product({ rating: 2.8, reviewCount: 20_000 }));
    expect(dissatisfied.painScore).toBeGreaterThan(satisfied.painScore);
  });

  it("空样本返回零分并保留未知评分", () => {
    const metrics = calculateMetrics([]);
    expect(metrics.opportunityScore).toBe(0);
    expect(metrics.medianRating).toBeNull();
    expect(metrics.sampleSize).toBe(0);
  });

  it("样本不足时不会给出值得深入的过度结论", () => {
    const result = buildAnalysisResult({
      query: "测试方向",
      source: "apps",
      country: "US",
      period: "90d",
      products: [product({ reviewCount: 100_000, rating: 2.5 })],
      sourceStatuses: [{ source: "apps", ok: true, count: 1, note: "采集成功" }],
      trendSummary: {
        hasHistory: false,
        comparisonDate: null,
        historyDays: 0,
        risingCount: 0,
        fallingCount: 0,
        stableCount: 0,
        newCount: 0,
        series: [],
      },
    });
    expect(result.verdict).toBe("谨慎验证");
  });

  it("时间范围按发布或更新时间保留活跃产品", () => {
    const now = Date.parse("2026-07-26T00:00:00Z");
    const active = product({ id: "active", updatedAt: "2026-07-10T00:00:00Z" });
    const inactive = product({ id: "inactive", updatedAt: "2025-01-01T00:00:00Z" });
    const upcoming = product({ id: "upcoming", releasedAt: "2026-08-20T00:00:00Z", updatedAt: null });
    expect(filterProductsByPeriod([active, inactive, upcoming], "30d", now).map((item) => item.id)).toEqual(["active"]);
  });

  it("评论增长达到阈值时标记为上升趋势", () => {
    const trend = deriveProductTrend(
      product({ reviewCount: 150 }),
      2,
      { reviewCount: 100, rating: 4.1, position: 4 },
      "2026-07-01T00:00:00Z",
    );
    expect(trend.direction).toBe("up");
    expect(trend.reviewDelta).toBe(50);
    expect(trend.rankDelta).toBe(2);
  });
});
