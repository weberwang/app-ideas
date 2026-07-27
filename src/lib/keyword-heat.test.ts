import { describe, expect, it, vi } from "vitest";
import { collectKeywordHeat, sampleKeywordHeat } from "@/lib/keyword-heat";
import type { KeywordHeatPoint } from "@/lib/types";

const now = Date.parse("2026-07-27T12:00:00Z");

/** 创建 JSON HTTP 响应。 */
function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("关键词公开关注热度", () => {
  it("按国家与 30 天范围采集并补齐稀疏日期", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ query: { search: [{ title: "专注" }] } }))
      .mockResolvedValueOnce(jsonResponse({ items: [
        { timestamp: "2026072000", views: 50 },
        { timestamp: "2026072600", views: 100 },
        { timestamp: "bad", views: -1 },
      ] }));

    const result = await collectKeywordHeat(
      { query: "专注 App", country: "CN", period: "30d" },
      { now, fetcher: fetcher as typeof fetch },
    );

    expect(result.status).toBe("ready");
    expect(result.totalViews).toBe(150);
    expect(result.articleUrl).toBe("https://zh.wikipedia.org/wiki/%E4%B8%93%E6%B3%A8");
    expect(result.series[0].capturedAt).toBe("2026-06-27T00:00:00.000Z");
    expect(result.series.at(-1)?.capturedAt).toBe("2026-07-26T00:00:00.000Z");
    expect(String(fetcher.mock.calls[0][0])).toContain("https://zh.wikipedia.org/w/api.php?");
    expect(String(fetcher.mock.calls[1][0])).toContain("/daily/20260627/20260726");
  });

  it("编码关键词参数和词条路径，不能让外部文本改变请求结构", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ query: { search: [{ title: "A/B" }] } }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));
    const query = "A/B &srlimit=500";

    await collectKeywordHeat(
      { query, country: "US", period: "90d" },
      { now, fetcher: fetcher as typeof fetch },
    );

    const searchUrl = new URL(String(fetcher.mock.calls[0][0]));
    expect(searchUrl.searchParams.get("srsearch")).toBe(query);
    expect(searchUrl.searchParams.get("srlimit")).toBe("1");
    expect(String(fetcher.mock.calls[1][0])).toContain("/A%2FB/");
  });

  it("全部时间从 Pageviews 起点按月采集", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ query: { search: [{ title: "Productivity" }] } }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ timestamp: "2026070100", views: 300 }] }));

    const result = await collectKeywordHeat(
      { query: "productivity", country: "GB", period: "all" },
      { now, fetcher: fetcher as typeof fetch },
    );

    expect(result.granularity).toBe("monthly");
    expect(String(fetcher.mock.calls[1][0])).toContain("/monthly/20150701/20260726");
    expect(result.series[0].capturedAt).toBe("2015-07-01T00:00:00.000Z");
    expect(result.series.at(-1)?.capturedAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("空关键词跳过请求，上游限流只降级热度结果", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({}, 429));
    const skipped = await collectKeywordHeat(
      { query: " ", country: "US", period: "30d" },
      { now, fetcher: fetcher as typeof fetch },
    );
    const unavailable = await collectKeywordHeat(
      { query: "focus", country: "US", period: "30d" },
      { now, fetcher: fetcher as typeof fetch },
    );

    expect(skipped.status).toBe("skipped");
    expect(unavailable.status).toBe("unavailable");
    expect(unavailable.note).toBe("Wikimedia 数据源限流");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("Pageviews 的 404 按官方语义处理为零浏览量", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ query: { search: [{ title: "Rare topic" }] } }))
      .mockResolvedValueOnce(jsonResponse({}, 404));

    const result = await collectKeywordHeat(
      { query: "rare topic", country: "US", period: "30d" },
      { now, fetcher: fetcher as typeof fetch },
    );

    expect(result.status).toBe("ready");
    expect(result.score).toBe(0);
    expect(result.totalViews).toBe(0);
  });

  it("长序列均匀取样并保留首尾", () => {
    const points: KeywordHeatPoint[] = Array.from({ length: 100 }, (_, index) => ({
      capturedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      views: index,
      value: index,
    }));
    const sampled = sampleKeywordHeat(points, 10);

    expect(sampled).toHaveLength(10);
    expect(sampled[0]).toBe(points[0]);
    expect(sampled.at(-1)).toBe(points.at(-1));
  });
});
