# Analytics

Self-hosted [Umami](https://umami.is). No cookies, no consent banner, no third party: the
tracker sends to our own box, and the numbers never leave it.

The client side is two files — `src/lib/modules/analytics/lib/umami.ts` (the transport) and
`model/analytics.model.ts` (the catalogue). Nothing is loaded or sent unless both
`VITE_ANALYTICS_HOST` and `VITE_ANALYTICS_SITE_ID` are set at build time, so dev servers and
local builds stay out of the dashboard.

## Events

Pageviews are the tracker's own job: it patches `history.pushState`, so SvelteKit's client-side
navigations are counted, each with its path and referrer. `/market/<id>` therefore gives
views-per-face for free. Everything else is a named event:

| Event           | Fires when                                                | Properties     |
| --------------- | --------------------------------------------------------- | -------------- |
| `face_view`     | a face's showcase page finished loading                     | `id`, `name`   |
| `editor_open`   | a document was loaded into the editor                       | `source`       |
| `import`        | a Facer / WatchMaker / Wear OS export was read              | `format`       |
| `watch_connect` | a watch finished pairing over Web Bluetooth                 | —              |
| `watch_upload`  | a face was flashed onto the watch                           | —              |
| `signup`        | an account was created through the register form            | —              |

`watch_upload` is the conversion — the funnel is `pageview → face_view → editor_open →
watch_connect → watch_upload`, and the drop between the last two is the pairing failure rate.

`source` is one of `market`, `file`, `new`, `facer`, `watchmaker`, `wff`. It is deliberately a
closed set: the editor's internal label for a dropped file is its **filename**, which is the
user's, not ours to collect.

Two known gaps, both deliberate:

- **OAuth signups are not counted.** The provider call is identical for a new account and a
  returning one, so the client can't tell them apart. Only the register form fires `signup`.
- **The first pageview of a session has an empty title** — the tracker fires before SvelteKit
  sets `<title>`. The URL is recorded correctly, which is what the reports group by.

Adding an event means adding it to `EventName` and one `sample()` in `analytics.model.ts`. The
model subscribes to events the feature models already fire rather than being called from them,
so `tests/analytics-events.browser.test.ts` is what catches a name or payload drifting.

## Deploying it (backend repo)

Umami is a Next.js app plus PostgreSQL. It goes next to PocketBase in `fmc_pocketbase`'s
`docker-compose.yml`, not exposed directly — Caddy fronts it on the same domain, which also
keeps the tracker on our own origin where ad-blocker heuristics leave it alone.

```yaml
umami:
  image: ghcr.io/umami-software/umami:postgresql-latest
  container_name: umami
  restart: unless-stopped
  environment:
    DATABASE_URL: postgresql://umami:${UMAMI_DB_PASSWORD}@umami-db:5432/umami
    DATABASE_TYPE: postgresql
    APP_SECRET: ${UMAMI_APP_SECRET} # any long random string; rotating it logs everyone out
    BASE_PATH: /stats # must match the Caddy path below
  depends_on: [umami-db]

umami-db:
  image: postgres:16-alpine
  container_name: umami-db
  restart: unless-stopped
  environment:
    POSTGRES_DB: umami
    POSTGRES_USER: umami
    POSTGRES_PASSWORD: ${UMAMI_DB_PASSWORD}
  volumes:
    - umami_db:/var/lib/postgresql/data
```

…with `umami_db:` added under the existing `volumes:` block, and in the `Caddyfile`, **above**
the catch-all `handle` that serves the SPA:

```caddyfile
handle /stats/* {
	reverse_proxy umami:3000
}
```

Then, once: log in at `https://<domain>/stats` (default `admin` / `umami` — change it
immediately), add the site, and copy the website id it mints. Set both vars in the frontend's
`.env` before `make deploy`:

```sh
VITE_ANALYTICS_HOST=/stats
VITE_ANALYTICS_SITE_ID=<the id from the dashboard>
```

To keep your own visits out of the numbers, run `localStorage.setItem('umami.disabled', 1)` in
the browser console once, per browser.

## Cost

The tracker is 4.7 KB over the wire, 2.3 KB gzipped, loaded `defer` after the app — measured
against `cloud.umami.is/script.js`, not quoted from the docs. On the editor route that is a
rounding error next to the canvas bundle; on the marketplace it is the smallest thing on the
page. Server-side it is one Node container plus a Postgres, roughly 400–600 MB of RAM on a box
that today runs a 31 MB Go binary — the real cost of this choice, and the reason Plausible CE
(which needs ClickHouse, 2–4 GB) was not the pick.
