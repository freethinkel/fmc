import { sveltekit } from "@sveltejs/kit/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    sveltekit({
      compilerOptions: {
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
      },
    }),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: {
          // *.browser.test.ts — anything that needs a real browser, whether that's mounting a
          // component or just reaching for canvas/ImageBitmap/FontFace (the editor libs do).
          name: "browser",
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
          include: ["tests/**/*.browser.{test,spec}.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/**/*.{test,spec}.ts"],
          exclude: ["tests/**/*.browser.{test,spec}.ts"],
        },
      },
    ],
  },
});
