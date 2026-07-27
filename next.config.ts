import type { NextConfig } from "next";

/** Next.js 应用配置。 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.mzstatic.com" },
      { protocol: "https", hostname: "shared.akamai.steamstatic.com" },
    ],
  },
};

export default nextConfig;
