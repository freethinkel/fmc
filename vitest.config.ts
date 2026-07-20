import { sveltekit } from '@sveltejs/kit/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    sveltekit({
      compilerOptions: {
        runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
      },
    }),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'components',
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
          include: ['src/**/*.svelte.{test,spec}.ts'],
        },
      },
    ],
  },
});
