import { describe, expect, it } from "vitest";
import { normalizeSteamProduct } from "@/lib/sources/steam";

describe("Steam 数据标准化", () => {
  it("将价格和好评比例转换为统一的五分制产品记录", () => {
    const product = normalizeSteamProduct(
      {
        type: "app",
        id: 1458100,
        name: "Cozy Grove",
        tiny_image: "https://shared.akamai.steamstatic.com/example.jpg",
      },
      {
        type: "game",
        name: "Cozy Grove",
        developers: ["Spry Fox LLC"],
        website: "https://cozygrovegame.com",
        price_overview: { currency: "USD", final: 1499 },
        genres: [{ id: "25", description: "Adventure" }],
        release_date: { coming_soon: false, date: "Apr 8, 2021" },
      },
      {
        success: 1,
        query_summary: { total_positive: 900, total_negative: 100, total_reviews: 1000 },
      },
    );

    expect(product.source).toBe("steam");
    expect(product.price).toBe(14.99);
    expect(product.rating).toBe(4.5);
    expect(product.reviewCount).toBe(1000);
    expect(product.homepageUrl).toBe("https://cozygrovegame.com/");
    expect(product.releasedAt).toBe("2021-04-08T00:00:00.000Z");
  });

  it("忽略非 HTTP 协议的产品主页", () => {
    const product = normalizeSteamProduct(
      { type: "app", id: 1, name: "Unsafe" },
      { type: "game", website: "javascript:alert(1)" },
      null,
    );

    expect(product.homepageUrl).toBeNull();
  });
});
