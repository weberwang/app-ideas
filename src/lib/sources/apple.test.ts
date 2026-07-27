import { describe, expect, it } from "vitest";
import { normalizeAppleProducts } from "@/lib/sources/apple";

describe("Apple 数据标准化", () => {
  it("同时保留产品主页与 App Store 详情页", () => {
    const [product] = normalizeAppleProducts([{
      trackId: 42,
      trackName: "Focus App",
      artistName: "Example Studio",
      primaryGenreName: "Productivity",
      sellerUrl: "https://example.com/focus",
      trackViewUrl: "https://apps.apple.com/app/id42",
    }], "apps");

    expect(product.homepageUrl).toBe("https://example.com/focus");
    expect(product.url).toBe("https://apps.apple.com/app/id42");
  });
});
