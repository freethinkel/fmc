# FMC Watchfaces Frontend

Watchface editor + marketplace for the CMF Watch Pro 2. SvelteKit (Svelte 5) SPA,
static build (`@sveltejs/adapter-static`). Backend — [`fmc_pocketbase`](../fmc_pocketbase)
(PocketBase), must be running for auth/marketplace to work.

Pages: landing page (`/`), marketplace (`/market`, `/my`), editor (`/editor`, with
flashing a watchface to the watch over Web Bluetooth), login/register (`/login`, `/register`).

## Development

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. Requires `fmc_pocketbase` running (`./pocketbase serve`,
see its `README.md`) — in dev, `/api` is proxied to `http://127.0.0.1:8090`
(`vite.config.js`), no separate setup needed.

The backend address can be overridden with the `VITE_PB_URL` env var; without it —
same-origin (`location.origin`), which is also what's used in prod behind Caddy.

### OAuth setup (one-time, optional)

Email login and registration work out of the box. For OAuth (Google/GitHub):

1. `cd ../fmc_pocketbase && ./pocketbase superuser upsert you@example.com <password>`
2. Open `http://127.0.0.1:8090/_/` → Collections → users → Options → OAuth2.
3. Enable the provider you need, fill in client id/secret (the admin panel shows the redirect URL).

## Build and deploy

```sh
npm run build      # static output into build/
make deploy DEPLOY_HOST=root@1.2.3.4   # builds and rsyncs to the VPS
```

`make deploy` uploads `build/` into `www/` inside the `fmc_pocketbase` clone on the
server — served by Caddy. Prod infra details — in
[`fmc_pocketbase/README.md`](../fmc_pocketbase/README.md).

## Type checking and tests

```sh
npm run check   # svelte-check
npm test        # round-trip test of the .bin parser/compiler against watchfaces/files/ fixtures
```
