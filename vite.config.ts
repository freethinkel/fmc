import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

export default defineConfig({
  css: {
    transformer: "lightningcss",
    lightningcss: {
      // evergreen floor: native nesting + oklch relative color everywhere else
      targets: { chrome: 112 << 16, safari: (16 << 16) | (4 << 8), firefox: 128 << 16 },
    },
  },
  build: { cssMinify: "lightningcss" },
  plugins: [
    ...(process.env.BASIC_SSL ? [basicSsl()] : []),
    tailwindcss(),
    sveltekit({
      compilerOptions: {
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
      },
      // SPA: the editor lives entirely on browser APIs (canvas, BLE)
      adapter: adapter({ fallback: "index.html" }),
    }),
  ],
});
