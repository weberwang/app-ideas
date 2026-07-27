/** 可供用户选择的公开数据平台。 */
export type MarketSource = "apps" | "games" | "steam" | "all";

/** 用户选择的活跃时间范围。 */
export type AnalysisPeriod = "30d" | "90d" | "180d" | "365d" | "all";

/** 产品相对历史快照的趋势方向。 */
export type TrendDirection = "up" | "down" | "stable" | "new" | "unknown";

/** 单个产品的可验证趋势信号。 */
export interface ProductTrend {
  direction: TrendDirection;
  reviewDelta: number | null;
  ratingDelta: number | null;
  rankDelta: number | null;
  reviewGrowthRate: number | null;
  comparisonDate: string | null;
}

/** 统一后的市场产品记录。 */
export interface MarketProduct {
  id: string;
  source: Exclude<MarketSource, "all">;
  name: string;
  developer: string;
  category: string;
  /** 产品独立官网；数据源未提供或地址不安全时为空。 */
  homepageUrl: string | null;
  /** 对应应用商店或游戏平台的产品详情页。 */
  url: string;
  iconUrl: string | null;
  rating: number | null;
  reviewCount: number;
  price: number;
  currency: string;
  releasedAt: string | null;
  updatedAt: string | null;
  ownersLow: number | null;
  ownersHigh: number | null;
  positiveReviews: number | null;
  negativeReviews: number | null;
  averagePlaytimeMinutes: number | null;
  opportunityScore: number;
  demandScore: number;
  painScore: number;
  monetizationScore: number;
  momentumScore: number;
  trend: ProductTrend;
  evidence: string[];
}

/** 单个平台的采集状态，避免把缺失数据误判成零需求。 */
export interface SourceStatus {
  source: Exclude<MarketSource, "all">;
  ok: boolean;
  count: number;
  note: string;
}

/** 市场级聚合指标。 */
export interface MarketMetrics {
  opportunityScore: number;
  demandScore: number;
  painScore: number;
  monetizationScore: number;
  competitionScore: number;
  sampleSize: number;
  highDemandCount: number;
  paidProductRatio: number;
  medianRating: number | null;
  medianReviews: number;
  trackedTrendCount: number;
  risingTrendCount: number;
}

/** 趋势图中的单个历史采样点。 */
export interface TrendPoint {
  capturedAt: string;
  medianReviews: number;
  averageRating: number | null;
  sampleSize: number;
}

/** 市场趋势汇总，历史不足时不会伪造涨跌。 */
export interface TrendSummary {
  hasHistory: boolean;
  comparisonDate: string | null;
  historyDays: number;
  risingCount: number;
  fallingCount: number;
  stableCount: number;
  newCount: number;
  series: TrendPoint[];
}

/** 关键词公开关注热度的时间序列点。 */
export interface KeywordHeatPoint {
  capturedAt: string;
  views: number;
  value: number;
}

/** 关键词公开关注热度汇总，不将百科浏览量冒充搜索量。 */
export interface KeywordHeatSummary {
  keyword: string;
  status: "ready" | "unavailable" | "skipped";
  score: number | null;
  averageViews: number | null;
  totalViews: number | null;
  changeRate: number | null;
  comparisonDate: string | null;
  granularity: "daily" | "monthly";
  articleTitle: string | null;
  articleUrl: string | null;
  series: KeywordHeatPoint[];
  note: string;
}

/** 分析接口返回结果。 */
export interface AnalysisResult {
  query: string;
  source: MarketSource;
  country: string;
  period: AnalysisPeriod;
  generatedAt: string;
  verdict: "值得深入" | "谨慎验证" | "暂不建议";
  summary: string;
  metrics: MarketMetrics;
  products: MarketProduct[];
  sourceStatuses: SourceStatus[];
  trendSummary: TrendSummary;
  keywordHeat: KeywordHeatSummary;
  caveats: string[];
}

/** 分析接口输入参数。 */
export interface AnalysisRequest {
  query: string;
  source: MarketSource;
  country: string;
  period: AnalysisPeriod;
}

/** 数据源返回的未评分产品。 */
export type RawMarketProduct = Omit<
  MarketProduct,
  | "opportunityScore"
  | "demandScore"
  | "painScore"
  | "monetizationScore"
  | "momentumScore"
  | "trend"
  | "evidence"
>;
