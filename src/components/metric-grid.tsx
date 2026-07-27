import { ArrowDownRight, ArrowUpRight, Info, Minus } from "@phosphor-icons/react";
import type { MarketMetrics } from "@/lib/types";

/** 指标区输入。 */
interface MetricGridProps {
  metrics: MarketMetrics;
}

/** 单个指标定义。 */
interface MetricItem {
  label: string;
  value: string;
  help: string;
  positive: boolean;
  neutral?: boolean;
}

/** 把零到一的比例显示为百分比。 */
function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** 展示市场级核心判断指标。 */
export function MetricGrid({ metrics }: MetricGridProps) {
  const items: MetricItem[] = [
    { label: "机会分", value: String(metrics.opportunityScore), help: "需求、痛点、付费与竞争的综合筛选分", positive: metrics.opportunityScore >= 55 },
    { label: "需求分", value: String(metrics.demandScore), help: "基于评论量、所有者估算和游玩时长", positive: metrics.demandScore >= 55 },
    { label: "痛点分", value: String(metrics.painScore), help: "高需求产品中的低评分与负面评论信号", positive: metrics.painScore >= 42 },
    { label: "竞争分", value: String(metrics.competitionScore), help: "样本密度与强势头部产品数量", positive: metrics.competitionScore < 55 },
    { label: "付费产品", value: percentage(metrics.paidProductRatio), help: "样本中价格高于零的产品比例", positive: metrics.paidProductRatio >= 0.25 },
    {
      label: "上升趋势",
      value: metrics.trackedTrendCount > 0 ? `${metrics.risingTrendCount}/${metrics.trackedTrendCount}` : "待积累",
      help: "相对历史快照评论增长或搜索位置上升的产品",
      positive: metrics.risingTrendCount > 0,
      neutral: metrics.trackedTrendCount === 0,
    },
  ];

  return (
    <section className="metric-grid" aria-label="市场指标">
      {items.map((item) => {
        const TrendIcon = item.neutral ? Minus : item.positive ? ArrowUpRight : ArrowDownRight;
        return (
          <article className="metric-item" key={item.label}>
            <div className="metric-label">
              <span>{item.label}</span>
              <span className="help" title={item.help}><Info size={15} weight="regular" /></span>
            </div>
            <div className="metric-value-row">
              <strong>{item.value}</strong>
              <TrendIcon className={item.positive ? "trend-positive" : "trend-muted"} size={18} weight="bold" />
            </div>
          </article>
        );
      })}
    </section>
  );
}
