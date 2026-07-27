import { describe, expect, it } from "vitest";
import { compactSnapshots, sampleTrendSnapshots, selectComparison, type MarketSnapshot } from "@/lib/trends";

const dayMs = 86_400_000;

/** 创建指定历史天数的趋势快照。 */
function snapshot(now: number, daysAgo: number): MarketSnapshot {
  return {
    capturedAt: new Date(now - daysAgo * dayMs).toISOString(),
    products: {},
  };
}

describe("市场趋势时间范围", () => {
  it("不会使用用户选择范围之外的快照作为对比基线", () => {
    const now = Date.parse("2026-07-27T00:00:00Z");
    const comparison = selectComparison([
      snapshot(now, 45),
      snapshot(now, 20),
      snapshot(now, 5),
    ], "30d", now);

    expect(comparison?.capturedAt).toBe(snapshot(now, 20).capturedAt);
  });

  it("选择范围内没有合格快照时不显示越界趋势", () => {
    const now = Date.parse("2026-07-27T00:00:00Z");
    expect(selectComparison([snapshot(now, 45)], "30d", now)).toBeNull();
  });

  it("趋势点过多时均匀覆盖完整范围并保留首尾", () => {
    const now = Date.parse("2026-07-27T00:00:00Z");
    const snapshots = Array.from({ length: 90 }, (_, index) => snapshot(now, 89 - index));
    const sampled = sampleTrendSnapshots(snapshots, 30);

    expect(sampled).toHaveLength(30);
    expect(sampled[0]).toBe(snapshots[0]);
    expect(sampled.at(-1)).toBe(snapshots.at(-1));
  });

  it("长期历史按日压缩且仍覆盖一年以上范围", () => {
    const now = Date.parse("2026-07-27T00:00:00Z");
    const snapshots = Array.from({ length: 400 * 4 }, (_, index) => snapshot(now, (1_599 - index) / 4));
    const compacted = compactSnapshots(snapshots, now);

    expect(compacted.length).toBeLessThan(snapshots.length);
    expect(Date.parse(compacted[0].capturedAt)).toBeLessThanOrEqual(now - 399 * dayMs);
    expect(compacted.at(-1)?.capturedAt).toBe(snapshot(now, 0).capturedAt);
  });
});
