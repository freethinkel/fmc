import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	return {
		// PB is proxied through the same origin — pb.ts uses location.origin.
		// https (basicSsl) is only needed for Safari+beacio: enable with BASIC_SSL=1 npm run dev;
		// Bluefy doesn't trust a self-signed cert and needs plain http
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
				// SPA: the editor lives entirely on browser APIs (canvas, BLE)
				adapter: adapter({ fallback: 'index.html' })
			})
		],
	};
});
