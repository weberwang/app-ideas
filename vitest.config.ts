import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Vitest 配置，保持测试别名与应用一致。 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
