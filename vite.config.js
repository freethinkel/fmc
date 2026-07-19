import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ponytail: dev-only — отдаёт ключ авторизации fmc CLI, чтобы BLE-коннект не спрашивал его руками
const fmcKey = () => ({
	name: 'fmc-key',
	configureServer(server) {
		const serve = (route, file) =>
			server.middlewares.use(route, (_req, res) => {
				try {
					res.end(readFileSync(join(homedir(), 'Library/Application Support/fmc', file), 'utf8').trim());
				} catch {
					res.statusCode = 404;
					res.end('');
				}
			});
		serve('/__fmckey', 'authkey');
		serve('/__fmclastid', 'last_wfid'); // id последней прошивки CLI — нужен как old_wf_id при занятых слотах
	}
});

export default defineConfig({
	// PB проксируем через тот же origin — pb.ts использует location.origin.
	// https (basicSsl) нужен только для Safari+beacio: включается BASIC_SSL=1 npm run dev;
	// Bluefy не доверяет самоподписанному серту, ему нужен обычный http
	server: {
		proxy: { '/api': 'http://127.0.0.1:8090' }
	},
	plugins: [
		...(process.env.BASIC_SSL ? [basicSsl()] : []),
		tailwindcss(),
		fmcKey(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// SPA: редактор целиком живёт на browser API (canvas, BLE)
			adapter: adapter({ fallback: 'index.html' })
		})
	],
});
