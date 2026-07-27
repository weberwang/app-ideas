import { ArrowDownRight, ArrowSquareOut, ArrowUpRight, Minus } from "@phosphor-icons/react";
import type { KeywordHeatPoint, KeywordHeatSummary } from "@/lib/types";

/** 关键词热度面板输入。 */
interface KeywordHeatPanelProps {
  summary: KeywordHeatSummary;
}

/** SVG 折线图坐标。 */
interface HeatChartPoint {
  x: number;
  y: number;
  label: string;
  value: number;
}

/** 紧凑显示页面浏览量。 */
function compactNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** 使用固定 UTC 年月日展示采集时间。 */
function shortDate(value: string, monthly: boolean): string {
  const date = new Date(value);
  return monthly
    ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
    : `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** 将相对热度映射为稳定的 SVG 坐标。 */
function chartPoints(series: KeywordHeatPoint[], monthly: boolean): HeatChartPoint[] {
  const width = 680;
  const height = 132;
  return series.map((point, index) => ({
    x: series.length === 1 ? width / 2 : index / (series.length - 1) * width,
    y: height - point.value / 100 * (height - 20) - 10,
    label: shortDate(point.capturedAt, monthly),
    value: point.value,
  }));
}

/** 展示 Wikipedia 页面浏览量形成的关键词公开关注热度代理。 */
export function KeywordHeatPanel({ summary }: KeywordHeatPanelProps) {
  if (summary.status === "skipped") return null;
  if (summary.status === "unavailable") {
    return (
      <section className="keyword-heat-panel unavailable" aria-labelledby="keyword-heat-title" aria-live="polite">
        <div>
          <h2 id="keyword-heat-title">关键词热度</h2>
          <p>{summary.note}</p>
        </div>
        <strong>暂不可用</strong>
      </section>
    );
  }

  const points = chartPoints(summary.series, summary.granularity === "monthly");
  const path = points.map((point) => `${point.x},${point.y}`).join(" ");
  const change = summary.changeRate;
  const ChangeIcon = change === null || change === 0 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  const changeText = change === null ? "样本不足" : `${change >= 0 ? "+" : ""}${Math.round(change * 100)}%`;
  const periodLabel = summary.granularity === "daily" ? "日均浏览" : "月均浏览";

  return (
    <section className="keyword-heat-panel" aria-labelledby="keyword-heat-title">
      <div className="keyword-heat-heading">
        <div>
          <span className="eyebrow">WIKIMEDIA PUBLIC ATTENTION</span>
          <h2 id="keyword-heat-title">关键词热度</h2>
          <p>
            匹配词条：{summary.articleUrl ? (
              <a href={summary.articleUrl} target="_blank" rel="noreferrer">
                {summary.articleTitle}<ArrowSquareOut size={13} />
              </a>
            ) : summary.articleTitle}
          </p>
        </div>
        <div className="keyword-heat-score">
          <strong>{summary.score ?? 0}</strong>
          <span>当前相对热度 / 100</span>
        </div>
      </div>

      <div className="keyword-heat-body">
        <div className="keyword-heat-chart">
          <svg aria-label="关键词公开关注热度变化折线图" role="img" viewBox="0 0 680 165">
            <line className="chart-grid-line" x1="0" x2="680" y1="132" y2="132" />
            {points.length > 1 && <polyline className="heat-chart-line" fill="none" points={path} />}
            {points.map((point, index) => (
              <g key={`${point.label}-${index}`}>
                <circle className="heat-chart-dot" cx={point.x} cy={point.y} r="3" />
                {(index === 0 || index === points.length - 1) && (
                  <text className="chart-label" textAnchor={index === 0 ? "start" : "end"} x={point.x} y="158">
                    {point.label}
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>
        <div className="keyword-heat-stats">
          <div><span>{periodLabel}</span><strong>{compactNumber(summary.averageViews ?? 0)}</strong></div>
          <div><span>近期变化</span><strong className={change !== null && change > 0 ? "positive" : ""}><ChangeIcon size={17} />{changeText}</strong></div>
          <div><span>区间浏览</span><strong>{compactNumber(summary.totalViews ?? 0)}</strong></div>
        </div>
      </div>
      <p className="keyword-heat-note">{summary.note}</p>
    </section>
  );
}
