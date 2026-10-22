# Analytics

[Aptabase](https://aptabase.com), self-hosted on our own server in Cyprus
(`aptabase.freethinkel.dev`). No cookies, no consent banner: events carry a
random session id that rotates after an hour idle, the locale, and the properties listed below —
nothing that identifies a person.

The client side is two files — `src/lib/modules/analytics/lib/aptabase.ts` (the transport) and
`model/analytics.model.ts` (the catalogue). Nothing is sent unless `VITE_APTABASE_KEY` is set at
build time, so dev servers and local builds stay out of the dashboard.

## Events

Aptabase has no pageviews of its own, so the root layout sends `page_view { page }` after every
navigation. `page` is the SvelteKit route id (`/market/[id]`, not the url): views-per-face is
`face_view`'s job. Everything else is a named event:

| Event                 | Fires when                                       | Properties         |
| --------------------- | ------------------------------------------------ | ------------------ |
| `face_view`           | a face's showcase page finished loading          | `id`, `name`       |
| `editor_open`         | a document was loaded into the editor            | `source`           |
| `import`              | a Facer / WatchMaker / Wear OS export was read   | `format`           |
| `watch_connect`       | a watch finished pairing over Web Bluetooth      | `device`           |
| `watch_upload`        | a face was flashed onto the watch                | `device`           |
| `watch_upload_failed` | a flash was started and did not finish           | `device`, `reason` |
| `signup`              | an account was created through the register form | —                  |

`watch_upload` is the conversion — the funnel is `page_view → face_view → editor_open →
watch_connect → watch_upload`, and the drop between the last two is the pairing failure rate.

`source` is one of `market`, `file`, `new`, `facer`, `watchmaker`, `wff`. It is deliberately a
closed set: the editor's internal label for a dropped file is its **filename**, which is the
user's, not ours to collect.

`reason` is the same kind of closed set, for the same reason — the raw failure messages carry
byte dumps and slot ids. It is one of `bad_file`, `rejected` (the watch said no), `stalled`
(the watch stopped answering), `disconnected`, `error` (anything else). A full watch is not counted:
that path opens the slot dialog and the user tries again.

### `device`, and why it is collected

`device` is the watch model: `CMF Watch Pro 2`, `CMF Watch 3 Pro`, `CMF Watch Pro 3`, or
`other`. This is a widening of what FMC collects — it is data about the user's hardware, not
about the site — so it is written down here rather than added quietly.

What we get from the watch is its advertised BLE name, e.g. `CMF Watch Pro 2-1A2B`. That tail
identifies the individual unit, so it never leaves the browser: the name is matched against the
list of models above and only the match is sent. An unrecognised watch is `other` — no
free-form string reaches the dashboard, exactly like `source`.

It is here because FMC is developed against one physical watch. Without the model on these
events, a Pro 3 that pairs and then fails to flash is invisible: it looks like a Pro 2 user who
changed their mind. With it, `watch_connect{device} → watch_upload{device}` is a per-model
funnel, and every Pro 3 owner who visits reports on hardware nobody here can test. Both Pro 3
spellings are listed because that model's advertised string is unverified; if `other` starts
filling up, that is the thing to fix.

Two known gaps, both deliberate:

- **OAuth signups are not counted.** The provider call is identical for a new account and a
  returning one, so the client can't tell them apart. Only the register form fires `signup`.
- **No referrer.** Aptabase doesn't record one, and `page_view` doesn't add it.

Adding an event means adding it to `EventName` and one `sample()` in `analytics.model.ts`. The
model subscribes to events the feature models already fire rather than being called from them,
so `tests/analytics-events.browser.test.ts` is what catches a name or payload drifting.

## Deploying it

Nothing on the PocketBase backend: events go straight to `aptabase.freethinkel.dev` (the host is
set in `aptabase.ts`; an `A-SH-` self-hosted key has none built in). The `deploy` target in the
`Makefile` sets `VITE_APTABASE_KEY` for `make deploy` — in plain text, not a secret, because the
key ends up in the bundle anyway. Building by hand: put the same line in
`.env`.

Your own visits on `localhost` are flagged as debug by the SDK and kept out of the release
numbers; the dashboard has a toggle between the two.

## Cost

The SDK is 2.6 KB, 1.3 KB gzipped, bundled — no extra request, no tracker script to host.
