import type { Metadata } from "next";
import "./globals.css";
import "./trends.css";

/** 页面元数据。 */
export const metadata: Metadata = {
  title: "产品雷达 | 公开数据市场分析",
  description: "用 App Store 公开数据筛选值得验证的应用与游戏方向。",
};

/** 应用根布局。 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // 浏览器扩展可能在 React 接管前给根节点注入属性，只抑制这个已知的根级差异。
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
