"use client";

import {
  ArrowDownRight,
  ArrowSquareOut,
  ArrowUpRight,
  CaretDown,
  ClockCounterClockwise,
  DownloadSimple,
  Minus,
  Sparkle,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useMemo, useState } from "react";
import type { MarketProduct } from "@/lib/types";

/** 产品列表输入。 */
interface ProductTableProps {
  products: MarketProduct[];
  query: string;
}

type SortKey = "opportunityScore" | "momentumScore" | "demandScore" | "painScore" | "reviewCount";

const productSourceLabels: Record<MarketProduct["source"], string> = {
  apps: "App Store 应用",
  games: "App Store 游戏",
  steam: "Steam 游戏",
};

/** 紧凑显示大数字。 */
function compactNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** 使用固定年月日展示活跃日期，避免客户端时区差异。 */
function formatDate(value: string | null): string {
  if (!value) return "日期未知";
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** 展示单个产品的历史趋势状态。 */
function TrendBadge({ product }: { product: MarketProduct }) {
  const trend = product.trend;
  if (trend.direction === "up") {
    return <span className="product-trend up"><ArrowUpRight size={16} />{trend.reviewDelta ? `+${compactNumber(trend.reviewDelta)} 评论` : "位置上升"}</span>;
  }
  if (trend.direction === "down") {
    return <span className="product-trend down"><ArrowDownRight size={16} />位置下降</span>;
  }
  if (trend.direction === "new") {
    return <span className="product-trend new"><Sparkle size={16} />新进入</span>;
  }
  if (trend.direction === "stable") {
    return <span className="product-trend"><Minus size={16} />稳定</span>;
  }
  return <span className="product-trend"><ClockCounterClockwise size={16} />待积累</span>;
}

/** 安全生成 CSV 单元格。 */
function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

/** 将当前排序后的产品导出为 CSV。 */
function exportProducts(products: MarketProduct[], query: string): void {
  const header = ["产品", "平台", "开发者", "分类", "机会分", "动能分", "趋势", "评论变化", "需求分", "痛点分", "评论数", "评分", "价格", "最近活跃", "链接"];
  const rows = products.map((product) => [
    product.name,
    product.source,
    product.developer,
    product.category,
    product.opportunityScore,
    product.momentumScore,
    product.trend.direction,
    product.trend.reviewDelta ?? "",
    product.demandScore,
    product.painScore,
    product.reviewCount,
    product.rating?.toFixed(2) ?? "",
    product.price,
    product.updatedAt ?? product.releasedAt ?? "",
    product.url,
  ]);
  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `${query.replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-") || "market"}-analysis.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** 展示可排序、可导出的产品证据表。 */
export function ProductTable({ products, query }: ProductTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("opportunityScore");
  const [minimumScore, setMinimumScore] = useState(0);
  const visibleProducts = useMemo(
    () => products
      .filter((product) => product.opportunityScore >= minimumScore)
      .sort((a, b) => b[sortKey] - a[sortKey]),
    [minimumScore, products, sortKey],
  );

  return (
    <section className="table-section" aria-labelledby="products-title">
      <div className="section-heading table-heading">
        <div>
          <h2 id="products-title">产品证据</h2>
          <p>可按机会、趋势动能或需求排序，定位正在增长且仍有明显缺口的产品。</p>
        </div>
        <div className="table-actions">
          <label className="select-control">
            <span className="sr-only">最低机会分</span>
            <select value={minimumScore} onChange={(event) => setMinimumScore(Number(event.target.value))}>
              <option value={0}>全部分数</option>
              <option value={50}>机会分 50+</option>
              <option value={65}>机会分 65+</option>
            </select>
            <CaretDown size={14} />
          </label>
          <label className="select-control">
            <span className="sr-only">排序方式</span>
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
              <option value="opportunityScore">按机会分</option>
              <option value="momentumScore">按趋势动能</option>
              <option value="demandScore">按需求分</option>
              <option value="painScore">按痛点分</option>
              <option value="reviewCount">按评论数</option>
            </select>
            <CaretDown size={14} />
          </label>
          <button className="secondary-button" type="button" onClick={() => exportProducts(visibleProducts, query)}>
            <DownloadSimple size={17} />导出 CSV
          </button>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>产品</th>
              <th>机会</th>
              <th>需求</th>
              <th>趋势</th>
              <th>痛点</th>
              <th>评论 / 所有者</th>
              <th>评分</th>
              <th>价格</th>
              <th><span className="sr-only">打开</span></th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((product) => (
              <tr key={product.id}>
                <td>
                  <div className="product-cell">
                    {product.iconUrl ? <Image src={product.iconUrl} alt="" width={40} height={40} /> : <span className="icon-fallback">{product.name.slice(0, 1)}</span>}
                    <div>
                      <strong>{product.name}</strong>
                      <span>{productSourceLabels[product.source]} · {product.developer}</span>
                      <small className="active-date">活跃 {formatDate(product.updatedAt ?? product.releasedAt)}</small>
                    </div>
                  </div>
                </td>
                <td><strong className="score-primary">{product.opportunityScore}</strong></td>
                <td>{product.demandScore}</td>
                <td><TrendBadge product={product} /></td>
                <td>{product.painScore}</td>
                <td>
                  {product.ownersLow
                    ? `${compactNumber(product.ownersLow)}+ 所有者`
                    : `${compactNumber(product.reviewCount)} 评论`}
                </td>
                <td>{product.rating === null ? "数据缺失" : product.rating.toFixed(1)}</td>
                <td>{product.price === 0 ? "免费" : `${product.currency} ${product.price.toFixed(2)}`}</td>
                <td><a className="external-link" href={product.url} target="_blank" rel="noreferrer" aria-label={`打开 ${product.name}`}><ArrowSquareOut size={18} /></a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibleProducts.length === 0 && <p className="table-empty">当前筛选条件下没有产品。</p>}
    </section>
  );
}
