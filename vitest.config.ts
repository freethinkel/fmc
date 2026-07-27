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
          // the round-trip walks every resource of every fixture through LZ4; Metaball alone
          // (38 resources, 24 of them JPEG) takes ~4 s and shares the machine with the
          // browser project, which is enough to blow the 5 s default
          testTimeout: 30000,
          include: ["tests/**/*.{test,spec}.ts"],
          exclude: ["tests/**/*.browser.{test,spec}.ts"],
        },
      },
    ],
  },
});
