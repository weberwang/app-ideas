"use client";

import {
  ArrowRight,
  ChartScatter,
  CheckCircle,
  Database,
  GameController,
  MagnifyingGlass,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { FormEvent, useEffect, useState } from "react";
import { MetricGrid } from "@/components/metric-grid";
import { KeywordHeatPanel } from "@/components/keyword-heat-panel";
import { ProductTable } from "@/components/product-table";
import { TrendPanel } from "@/components/trend-panel";
import type { AnalysisPeriod, AnalysisResult, MarketSource } from "@/lib/types";

const exampleQueries = ["habit tracker", "AI photo editor", "Cozy", "Roguelike"];
const historyStorageKey = "market-signal-history:v2";

const sourceLabels: Record<Exclude<MarketSource, "all">, string> = {
  apps: "Apple 应用",
  games: "App Store 游戏",
  steam: "Steam 游戏",
};

const periodLabels: Record<AnalysisPeriod, string> = {
  "30d": "近 30 天",
  "90d": "近 90 天",
  "180d": "近 180 天",
  "365d": "近 1 年",
  all: "全部时间",
};

/** 保存到浏览器的轻量历史记录。 */
interface SearchHistoryItem {
  query: string;
  source: MarketSource;
  period: AnalysisPeriod;
  country: string;
  score: number;
  generatedAt: string;
}

/** 从浏览器恢复历史记录，损坏数据直接忽略。 */
function readHistory(): SearchHistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(historyStorageKey) ?? "[]") as SearchHistoryItem[];
  } catch {
    return [];
  }
}

/** 将一次分析加入最近记录。 */
function rememberResult(result: AnalysisResult): SearchHistoryItem[] {
  const next = [
    {
      query: result.query,
      source: result.source,
      period: result.period,
      country: result.country,
      score: result.metrics.opportunityScore,
      generatedAt: result.generatedAt,
    },
    ...readHistory().filter((item) => !(
      item.query === result.query && item.source === result.source && item.period === result.period
    )),
  ].slice(0, 6);
  try {
    localStorage.setItem(historyStorageKey, JSON.stringify(next));
  } catch {
    // 隐私模式或存储配额不足时，仅保留当前内存状态。
  }
  return next;
}

/** 公开数据市场分析主工作台。 */
export function AnalysisWorkbench() {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<MarketSource>("apps");
  const [country, setCountry] = useState("US");
  const [period, setPeriod] = useState<AnalysisPeriod>("90d");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 延后读取浏览器存储，保证服务端首屏与客户端首次渲染一致。
    const frame = requestAnimationFrame(() => setHistory(readHistory()));
    return () => cancelAnimationFrame(frame);
  }, []);

  /** 提交分析并保留最后一次成功结果。 */
  async function submitAnalysis(event?: FormEvent, overrideQuery?: string): Promise<void> {
    event?.preventDefault();
    const nextQuery = (overrideQuery ?? query).trim();
    if (nextQuery.length === 1 || loading) return;
    setQuery(nextQuery);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: nextQuery, source, country, period }),
      });
      const payload = await response.json() as AnalysisResult | { error: string };
      if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "分析请求失败");
      setResult(payload);
      setHistory(rememberResult(payload));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "分析请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="产品雷达首页">
          <span className="brand-mark"><ChartScatter size={21} weight="bold" /></span>
          <span>产品雷达</span>
        </a>
        <nav aria-label="主导航">
          <a className="nav-item active" href="#analysis"><MagnifyingGlass size={18} />市场分析</a>
          <a className="nav-item" href="#method"><Database size={18} />评分方法</a>
        </nav>
        <div className="sidebar-section">
          <p className="sidebar-label">最近分析</p>
          {history.length === 0 ? (
            <p className="history-empty">完成一次分析后会保存在此浏览器。</p>
          ) : history.map((item) => (
            <button
              className="history-item"
              key={`${item.query}-${item.source}-${item.period}`}
              onClick={() => {
                setQuery(item.query);
                setSource(item.source);
                setPeriod(item.period);
                setCountry(item.country);
              }}
              type="button"
            >
              <span>{item.query || "整体市场"} · {periodLabels[item.period]}</span><strong>{item.score}</strong>
            </button>
          ))}
        </div>
        <p className="sidebar-foot">仅使用公开数据<br />不等同于投资或收入建议</p>
      </aside>

      <main id="top" className="workspace">
        <header className="page-header" id="analysis">
          <div>
            <p className="context-label">公开数据决策工作台</p>
            <h1>先看证据，再决定做什么。</h1>
            <p>对 App、App Store 游戏与 Steam 游戏做快速初筛，把开发时间留给更值得验证的方向。</p>
          </div>
          <div className="data-badge"><span />数据按来源缓存</div>
        </header>

        <form className="analysis-form" onSubmit={(event) => submitAnalysis(event)}>
          <div className="source-tabs" role="radiogroup" aria-label="数据源">
            {([
              ["apps", "App 市场"],
              ["games", "App Store 游戏"],
              ["steam", "Steam 游戏"],
              ["all", "合并分析"],
            ] as const).map(([value, label]) => (
              <button
                aria-checked={source === value}
                className={source === value ? "source-tab selected" : "source-tab"}
                key={value}
                onClick={() => setSource(value)}
                role="radio"
                type="button"
              >
                {value === "games" || value === "steam" ? <GameController size={17} /> : <Database size={17} />}{label}
              </button>
            ))}
          </div>
          <div className="search-row">
            <label className="search-input">
              <MagnifyingGlass size={20} />
              <input
                aria-label="产品或游戏关键词"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={source === "games" || source === "steam" ? "留空看整体趋势，或输入 Cozy" : "留空看整体趋势，或输入 habit tracker"}
              />
            </label>
            <label className="country-select">
              <span>市场</span>
              <select value={country} onChange={(event) => setCountry(event.target.value)}>
                <option value="US">美国</option>
                <option value="CN">中国</option>
                <option value="JP">日本</option>
                <option value="GB">英国</option>
                <option value="DE">德国</option>
              </select>
            </label>
            <label className="country-select">
              <span>时间范围</span>
              <select value={period} onChange={(event) => setPeriod(event.target.value as AnalysisPeriod)}>
                <option value="30d">近 30 天</option>
                <option value="90d">近 90 天</option>
                <option value="180d">近 180 天</option>
                <option value="365d">近 1 年</option>
                <option value="all">全部时间</option>
              </select>
            </label>
            <button className="primary-button" disabled={loading || query.trim().length === 1} type="submit">
              {loading ? <SpinnerGap className="spinner" size={19} /> : <ArrowRight size={19} />}
              {loading ? "采集中" : query.trim() ? "开始分析" : "查看整体趋势"}
            </button>
          </div>
          <div className="query-examples">
            <span>试试：</span>
            {exampleQueries.map((example) => <button key={example} type="button" onClick={() => submitAnalysis(undefined, example)}>{example}</button>)}
          </div>
        </form>

        {error && <div className="error-banner" role="alert"><WarningCircle size={20} /><span>{error}</span></div>}

        {!result && !loading && (
          <section className="empty-state">
            <div className="empty-visual"><ChartScatter size={34} /></div>
            <h2>直接看大盘，或从具体方向开始</h2>
            <p>关键词留空会读取公开榜单形成市场总览；输入关键词则分析具体赛道。重复相同条件后，系统会形成真实趋势。</p>
            <div className="empty-steps">
              <span><strong>01</strong>采集公开样本</span>
              <span><strong>02</strong>统一指标口径</span>
              <span><strong>03</strong>给出验证优先级</span>
            </div>
          </section>
        )}

        {loading && !result && (
          <section className="loading-state" aria-live="polite">
            <SpinnerGap className="spinner" size={30} /><h2>正在采集公开样本</h2><p>通常需要几秒钟，合并分析会并行请求三个市场。</p>
          </section>
        )}

        {result && (
          <div className={loading ? "result-area refreshing" : "result-area"}>
            <section className="verdict-row">
              <div>
                <span className={`verdict verdict-${result.verdict}`}>{result.verdict === "值得深入" ? <CheckCircle size={17} weight="fill" /> : <WarningCircle size={17} weight="fill" />}{result.verdict}</span>
                <h2>{result.query ? `“${result.query}”` : "整体市场"} · {periodLabels[result.period]} 市场初筛</h2>
                <p>{result.summary}</p>
              </div>
              <div className="sample-meta"><strong>{result.metrics.sampleSize}</strong><span>时间段内活跃样本</span></div>
            </section>
            <MetricGrid metrics={result.metrics} />
            <KeywordHeatPanel summary={result.keywordHeat} />
            <TrendPanel summary={result.trendSummary} period={result.period} />
            <div className="source-statuses">
              {result.sourceStatuses.map((status) => (
                <span className={status.ok ? "source-ok" : "source-error"} key={status.source}>
                  {status.ok ? <CheckCircle size={16} /> : <WarningCircle size={16} />}
                  {sourceLabels[status.source]}: {status.note} {status.count > 0 ? `(${status.count})` : ""}
                </span>
              ))}
            </div>
            <ProductTable products={result.products} query={result.query} />
            <section className="method-section" id="method">
              <div className="section-heading"><div><h2>如何理解这份结果</h2><p>它是一套缩小范围的筛选器，不是预测模型。</p></div></div>
              <div className="method-grid">
                <article><strong>需求</strong><p>评论量经过对数归一，避免头部产品完全压制中小样本。</p></article>
                <article><strong>痛点</strong><p>评分低并不自动代表机会，只有具备一定需求置信度时才提高痛点分。</p></article>
                <article><strong>趋势</strong><p>相同条件至少间隔 6 小时后，比较评论增量和搜索位置变化，不用当前值伪造历史。</p></article>
                <article><strong>下一步</strong><p>选择 3 到 5 个高机会样本，阅读差评并访谈真实用户，再制作人工服务或低成本原型。</p></article>
              </div>
              <ul className="caveat-list">{result.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
