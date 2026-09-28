import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode ?? "development", process.cwd(), "");

  return {
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [react()],
    test: {
      env,
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      exclude: ["src/**/*.e2e.ts", "src/**/*.e2e.tsx"],
      passWithNoTests: true,
      fileParallelism: false,
      testTimeout: 60_000,
      hookTimeout: 60_000,
      coverage: {
        provider: "v8",
        reporter: ["text", "html"],
        exclude: ["src/components/ui/**", "src/routeTree.gen.ts", "src/test/**"],
      },
    },
  };
});
