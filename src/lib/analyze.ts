import { buildAnalysisResult } from "@/lib/scoring";
import { collectKeywordHeat } from "@/lib/keyword-heat";
import { loadAppleCharts, searchAppleApps } from "@/lib/sources/apple";
import { loadSteamCharts, searchSteamGames } from "@/lib/sources/steam";
import { filterProductsByPeriod } from "@/lib/period";
import { trackProductTrends } from "@/lib/trends";
import type { AnalysisRequest, AnalysisResult, RawMarketProduct, SourceStatus } from "@/lib/types";

/** 单个数据源的安全执行结果。 */
interface SourceRun {
  products: RawMarketProduct[];
  status: SourceStatus;
}

/** 执行数据源并将异常转换为可展示状态，避免整次分析失败。 */
async function runSource(
  source: SourceStatus["source"],
  loader: () => Promise<RawMarketProduct[]>,
): Promise<SourceRun> {
  try {
    const products = await loader();
    return {
      products,
      status: {
        source,
        ok: true,
        count: products.length,
        note: products.length > 0 ? "采集成功" : "未找到匹配样本",
      },
    };
  } catch (error) {
    return {
      products: [],
      status: {
        source,
        ok: false,
        count: 0,
        note: error instanceof Error ? error.message : "数据源请求失败",
      },
    };
  }
}

/** 并行采集用户选择的平台并计算市场机会。 */
export async function analyzeMarket(input: AnalysisRequest): Promise<AnalysisResult> {
  const jobs: Promise<SourceRun>[] = [];
  const hasQuery = input.query.length > 0;
  if (input.source === "apps" || input.source === "all") {
    jobs.push(runSource("apps", () => hasQuery
      ? searchAppleApps(input.query, input.country, "apps")
      : loadAppleCharts(input.country, "apps")));
  }
  if (input.source === "games" || input.source === "all") {
    jobs.push(runSource("games", () => hasQuery
      ? searchAppleApps(input.query, input.country, "games")
      : loadAppleCharts(input.country, "games")));
  }
  if (input.source === "steam" || input.source === "all") {
    jobs.push(runSource("steam", () => hasQuery
      ? searchSteamGames(input.query, input.country)
      : loadSteamCharts(input.country)));
  }

  // 热度采集与平台请求相互独立，并行执行可避免额外增加完整分析等待时间。
  const [runs, keywordHeat] = await Promise.all([
    Promise.all(jobs),
    collectKeywordHeat(input),
  ]);
  const activeProducts = filterProductsByPeriod(
    runs.flatMap((run) => run.products),
    input.period,
  );
  const trends = await trackProductTrends(input, activeProducts);
  return buildAnalysisResult({
    ...input,
    products: trends.products,
    sourceStatuses: runs.map((run) => run.status),
    trendSummary: trends.summary,
    keywordHeat,
  });
}
