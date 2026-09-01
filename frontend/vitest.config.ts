import { defineConfig } from "vitest/config";

// classifier/cropper/leveler는 DOM 없이 순수 로직만 테스트하므로 node 환경으로 충분하다.
export default defineConfig({
  test: {
    environment: "node",
  },
});
