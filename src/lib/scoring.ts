import type {
  AnalysisResult,
  AnalysisPeriod,
  MarketMetrics,
  MarketProduct,
  MarketSource,
  ProductTrend,
  RawMarketProduct,
  SourceStatus,
  TrendSummary,
} from "@/lib/types";

const unknownTrend: ProductTrend = {
  direction: "unknown",
  reviewDelta: null,
  ratingDelta: null,
  rankDelta: null,
  reviewGrowthRate: null,
  comparisonDate: null,
};

/** 把数值限制在评分区间内。 */
function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

/** 返回数组中位数，空数组返回零。 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** 将评论量或所有者估算转换为可比较的需求分。 */
function demandScore(product: RawMarketProduct): number {
  const ownerSignal = product.ownersLow ? Math.log10(product.ownersLow + 1) * 15 : 0;
  const reviewSignal = Math.log10(product.reviewCount + 1) * 20;
  const playtimeSignal = product.averagePlaytimeMinutes
    ? Math.log10(product.averagePlaytimeMinutes + 1) * 8
    : 0;
  return Math.round(clamp(Math.max(ownerSignal, reviewSignal) + playtimeSignal));
}

/** 从高需求但低满意度中估算未满足需求。 */
function painScore(product: RawMarketProduct, demand: number): number {
  const ratingPain = product.rating === null ? 35 : clamp((5 - product.rating) * 25);
  const reviewTotal = (product.positiveReviews ?? 0) + (product.negativeReviews ?? 0);
  const negativeRatio = reviewTotal > 0 ? (product.negativeReviews ?? 0) / reviewTotal : 0;
  const confidence = clamp(Math.log10(product.reviewCount + 1) / 4, 0.2, 1);
  return Math.round(clamp((ratingPain * 0.65 + negativeRatio * 100 * 0.35) * confidence + demand * 0.15));
}

/** 从付费价格和用户投入判断付费意愿，不把高价直接等同于好机会。 */
function monetizationScore(product: RawMarketProduct): number {
  const paidSignal = product.price > 0 ? 55 + Math.log10(product.price + 1) * 18 : 28;
  const engagementSignal = product.averagePlaytimeMinutes
    ? clamp(Math.log10(product.averagePlaytimeMinutes + 1) * 12)
    : 0;
  return Math.round(clamp(paidSignal + engagementSignal * 0.25));
}

/** 将实际历史变化转换为动能分，历史不足时保持中性。 */
function momentumScore(trend: ProductTrend): number {
  if (trend.direction === "unknown") return 50;
  if (trend.direction === "new") return 62;
  const rankSignal = (trend.rankDelta ?? 0) * 4;
  const growthSignal = clamp((trend.reviewGrowthRate ?? 0) * 250, -25, 35);
  return Math.round(clamp(50 + rankSignal + growthSignal));
}

/** 为单个产品生成可解释评分和证据标签。 */
export function scoreProduct(product: RawMarketProduct & { trend?: ProductTrend }): MarketProduct {
  const demand = demandScore(product);
  const pain = painScore(product, demand);
  const monetization = monetizationScore(product);
  const trend = product.trend ?? unknownTrend;
  const momentum = momentumScore(trend);
  const opportunity = Math.round(demand * 0.4 + pain * 0.3 + monetization * 0.2 + momentum * 0.1);
  const evidence: string[] = [];

  if (demand >= 65) evidence.push("需求信号强");
  if (pain >= 45) evidence.push("存在体验缺口");
  if (monetization >= 55) evidence.push("付费信号明确");
  if (trend.direction === "up") evidence.push("趋势上升");
  if (trend.direction === "new") evidence.push("新进入样本");
  if (product.reviewCount < 50) evidence.push("样本偏少");

  return {
    ...product,
    opportunityScore: opportunity,
    demandScore: demand,
    painScore: pain,
    monetizationScore: monetization,
    momentumScore: momentum,
    trend,
    evidence,
  };
}

/** 聚合市场样本，竞争分越高表示头部和样本越拥挤。 */
export function calculateMetrics(products: MarketProduct[]): MarketMetrics {
  if (products.length === 0) {
    return {
      opportunityScore: 0,
      demandScore: 0,
      painScore: 0,
      monetizationScore: 0,
      competitionScore: 0,
      sampleSize: 0,
      highDemandCount: 0,
      paidProductRatio: 0,
      medianRating: null,
      medianReviews: 0,
      trackedTrendCount: 0,
      risingTrendCount: 0,
    };
  }

  const ratings = products.flatMap((product) => (product.rating === null ? [] : [product.rating]));
  const demand = median(products.map((product) => product.demandScore));
  const pain = median(products.map((product) => product.painScore));
  const monetization = median(products.map((product) => product.monetizationScore));
  const incumbents = products.filter((product) => product.demandScore >= 70).length;
  const competition = Math.round(clamp(products.length * 0.9 + incumbents * 5));
  const opportunity = Math.round(clamp(demand * 0.4 + pain * 0.35 + monetization * 0.25 - competition * 0.18 + 12));

  return {
    opportunityScore: opportunity,
    demandScore: Math.round(demand),
    painScore: Math.round(pain),
    monetizationScore: Math.round(monetization),
    competitionScore: competition,
    sampleSize: products.length,
    highDemandCount: incumbents,
    paidProductRatio: products.filter((product) => product.price > 0).length / products.length,
    medianRating: ratings.length > 0 ? median(ratings) : null,
    medianReviews: Math.round(median(products.map((product) => product.reviewCount))),
    trackedTrendCount: products.filter((product) => product.trend.direction !== "unknown").length,
    risingTrendCount: products.filter((product) => product.trend.direction === "up").length,
  };
}

/** 根据聚合分数生成明确但不过度承诺的结论。 */
function verdictFor(score: number, sampleSize: number): AnalysisResult["verdict"] {
  if (sampleSize < 8) return "谨慎验证";
  if (score >= 62) return "值得深入";
  if (score >= 42) return "谨慎验证";
  return "暂不建议";
}

/** 组装最终分析结果，并保留数据源状态和限制说明。 */
export function buildAnalysisResult(input: {
  query: string;
  source: MarketSource;
  country: string;
  period: AnalysisPeriod;
  products: Array<RawMarketProduct & { trend?: ProductTrend }>;
  sourceStatuses: SourceStatus[];
  trendSummary: TrendSummary;
}): AnalysisResult {
  const products = input.products.map(scoreProduct).sort((a, b) => b.opportunityScore - a.opportunityScore);
  const metrics = calculateMetrics(products);
  const verdict = verdictFor(metrics.opportunityScore, metrics.sampleSize);
  const summary = metrics.sampleSize === 0
    ? "没有获得足够样本。请换一个更具体的关键词，或检查数据源状态。"
    : `样本显示需求分 ${metrics.demandScore}，痛点分 ${metrics.painScore}，竞争分 ${metrics.competitionScore}。建议先访谈目标用户，再决定是否开发。`;

  return {
    query: input.query,
    source: input.source,
    country: input.country,
    period: input.period,
    generatedAt: new Date().toISOString(),
    verdict,
    summary,
    metrics,
    products,
    sourceStatuses: input.sourceStatuses,
    trendSummary: input.trendSummary,
    caveats: [
      "机会分用于筛选方向，不代表收入预测。",
      "无关键词时使用 Apple 免费/付费榜单与 Steam 热销/新品榜单，它们代表当前榜单样本，不等同于平台全部产品。",
      "App Store 搜索结果不是完整市场榜单，关键词相关性也会影响样本范围。",
      "Steam 商店搜索与评论端点是公开可访问数据，但不是完整市场榜单，接口字段也可能调整。",
      "趋势来自本项目按相同条件保存的公开数据快照，首次采集不会伪造历史涨跌。",
      "公开数据缺少获客成本、留存率和真实利润，最终决策仍需用户访谈与小规模验证。",
    ],
  };
}
