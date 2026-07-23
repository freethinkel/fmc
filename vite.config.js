import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	return {
		// PB проксируем через тот же origin — pb.ts использует location.origin.
		// https (basicSsl) нужен только для Safari+beacio: включается BASIC_SSL=1 npm run dev;
		// Bluefy не доверяет самоподписанному серту, ему нужен обычный http
		server: {
			proxy: {
				'/api': { target: env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8090', changeOrigin: true, secure: true }
			}
		},
		plugins: [
			...(process.env.BASIC_SSL ? [basicSsl()] : []),
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				// SPA: редактор целиком живёт на browser API (canvas, BLE)
				adapter: adapter({ fallback: 'index.html' })
			})
		],
	};
});
