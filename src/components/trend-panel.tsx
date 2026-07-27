import { ArrowDownRight, ArrowUpRight, ClockCounterClockwise, Minus, Sparkle } from "@phosphor-icons/react";
import type { AnalysisPeriod, TrendPoint, TrendSummary } from "@/lib/types";

/** 趋势面板输入。 */
interface TrendPanelProps {
  summary: TrendSummary;
  period: AnalysisPeriod;
}

/** 折线图中的坐标点。 */
interface ChartPoint {
  x: number;
  y: number;
  label: string;
  value: number;
}

const periodLabels: Record<AnalysisPeriod, string> = {
  "30d": "近 30 天",
  "90d": "近 90 天",
  "180d": "近 180 天",
  "365d": "近 1 年",
  all: "全部时间",
};

/** 使用固定 UTC 月日，避免服务端与客户端时区造成水合差异。 */
function shortDate(value: string): string {
  const date = new Date(value);
  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** 将评论中位数映射为对数坐标，避免头部产品压平曲线。 */
function chartPoints(series: TrendPoint[]): ChartPoint[] {
  const width = 680;
  const height = 150;
  const values = series.map((point) => Math.log10(point.medianReviews + 1));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, 0.1);
  return series.map((point, index) => ({
    x: series.length === 1 ? width / 2 : (index / (series.length - 1)) * width,
    y: height - ((values[index] - minimum) / range) * (height - 24) - 12,
    label: shortDate(point.capturedAt),
    value: point.medianReviews,
  }));
}

/** 展示真实快照趋势；只有一个采样点时明确提示等待积累。 */
export function TrendPanel({ summary, period }: TrendPanelProps) {
  const points = chartPoints(summary.series);
  const path = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <section className="trend-panel" aria-labelledby="trend-title">
      <div className="trend-heading">
        <div>
          <h2 id="trend-title">市场趋势</h2>
          <p>{periodLabels[period]} · 评论中位数与搜索位置变化</p>
        </div>
        <span className={summary.hasHistory ? "trend-status ready" : "trend-status"}>
          <ClockCounterClockwise size={16} />
          {summary.hasHistory ? `对比 ${summary.historyDays} 天前` : "已建立首个基线"}
        </span>
      </div>

      <div className="trend-content">
        <div className="trend-chart">
          {summary.hasHistory && points.length >= 2 ? (
            <svg aria-label="评论中位数变化折线图" role="img" viewBox="0 0 680 185">
              <line className="chart-grid-line" x1="0" x2="680" y1="150" y2="150" />
              <polyline className="chart-line" fill="none" points={path} />
              {points.map((point) => (
                <g key={`${point.label}-${point.x}`}>
                  <circle className="chart-dot" cx={point.x} cy={point.y} r="4" />
                  <text className="chart-label" x={point.x} y="176" textAnchor="middle">{point.label}</text>
                </g>
              ))}
            </svg>
          ) : (
            <div className="trend-baseline">
              <ClockCounterClockwise size={28} />
              <strong>趋势基线已保存</strong>
              <span>下次以相同条件分析时，将比较真实的评论和搜索位置变化。</span>
            </div>
          )}
        </div>

        <div className="trend-stats" aria-label="趋势样本统计">
          <div><ArrowUpRight className="trend-up" size={19} /><span>上升</span><strong>{summary.risingCount}</strong></div>
          <div><ArrowDownRight className="trend-down" size={19} /><span>下降</span><strong>{summary.fallingCount}</strong></div>
          <div><Minus className="trend-stable" size={19} /><span>稳定</span><strong>{summary.stableCount}</strong></div>
          <div><Sparkle className="trend-new" size={19} /><span>新进入</span><strong>{summary.newCount}</strong></div>
        </div>
      </div>
    </section>
  );
}
