import { NextResponse } from "next/server";
import { analyzeMarket } from "@/lib/analyze";
import type { AnalysisPeriod, AnalysisRequest, MarketSource } from "@/lib/types";

const allowedSources = new Set<MarketSource>(["apps", "games", "steam", "all"]);
const allowedPeriods = new Set<AnalysisPeriod>(["30d", "90d", "180d", "365d", "all"]);
const countryPattern = /^[a-z]{2}$/i;

/** 校验分析请求，限制长度以免公开接口被滥用。 */
function parseRequest(value: unknown): AnalysisRequest {
  if (!value || typeof value !== "object") throw new Error("请求格式无效");
  const body = value as Record<string, unknown>;
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const source = body.source as MarketSource;
  const country = typeof body.country === "string" ? body.country.toUpperCase() : "US";
  const period = body.period as AnalysisPeriod;

  if (query.length === 1 || query.length > 60) throw new Error("关键词可以留空，输入时长度应为 2 到 60 个字符");
  if (!allowedSources.has(source)) throw new Error("数据源无效");
  if (!countryPattern.test(country)) throw new Error("国家代码应为两个英文字母");
  if (!allowedPeriods.has(period)) throw new Error("时间范围无效");
  return { query, source, country, period };
}

/** 接收一次市场分析请求。 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const input = parseRequest(await request.json());
    return NextResponse.json(await analyzeMarket(input));
  } catch (error) {
    const message = error instanceof Error ? error.message : "分析失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
