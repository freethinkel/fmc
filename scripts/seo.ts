// Post-build pass: the part of SEO a client-rendered SPA cannot do at runtime.
//
// Link unfurlers (Telegram, Discord, Slack, X) fetch the HTML and never run the JavaScript, so
// <svelte:head> is invisible to them — whatever meta they see has to already be in the file on
// disk. `adapter-static` emits one shell (build/index.html) for every route, which is why every
// shared link is currently the same blank box.
//
// So: stamp the site-wide card into that shell, then write a per-record copy of it for each
// published watchface and each creator, at the path Caddy resolves for their URL. The app inside
// is byte-for-byte the same SPA (asset URLs are absolute), only the <head> block differs.
//
// ponytail: the stubs are a build-time snapshot — a face published after the last deploy unfurls
// with the site-wide card until the next one. The upgrade path is serving /market/* from a
// PocketBase hook instead of from disk; not worth a backend route while deploys are per-merge.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// the same strings the pages set at runtime — see the note at the top of that file
import {
  creatorDesc,
  creatorTitle,
  DEVICE,
  faceDesc,
  faceTitle,
  siteDesc,
  siteTitle,
  SITE_NAME,
} from "../src/lib/shared/seo/copy.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(ROOT, "build");

// prod serves the SPA and PocketBase from one origin, so one variable normally covers both
const SITE = (process.env.SITE_URL || "https://fmc.freethinkel.dev").replace(/\/$/, "");
const PB = (process.env.PB_URL || SITE).replace(/\/$/, "");

const DEFAULT_IMAGE = `${SITE}/og-default.png`;
const DEFAULT_ALT = `${SITE_NAME} — watchfaces for the ${DEVICE}`;

// ---- the meta block ----

interface Card {
  title: string;
  description: string;
  /** absolute, canonical */
  url: string;
  image: string;
  imageAlt: string;
  /** square dial render vs the 1200x630 wordmark card — see the twitter:card note below */
  square?: boolean;
}

const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** One line of prose out of whatever the field holds: no newlines, no runaway length. */
const oneLine = (s: string, max = 200) => {
  const flat = s.replace(/\s+/g, " ").trim();

  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

const metaBlock = (c: Card) => {
  const tags: [string, string][] = [
    ["name=description", c.description],
    ["property=og:type", "website"],
    ["property=og:site_name", SITE_NAME],
    ["property=og:title", c.title],
    ["property=og:description", c.description],
    ["property=og:url", c.url],
    ["property=og:image", c.image],
    ["property=og:image:alt", c.imageAlt],
    // a dial is square: asking for the wide card would letterbox-crop the top and bottom of
    // the watch off. The wordmark card is drawn 1200x630 and does want the wide treatment.
    ["name=twitter:card", c.square ? "summary" : "summary_large_image"],
    ["name=twitter:title", c.title],
    ["name=twitter:description", c.description],
    ["name=twitter:image", c.image],
  ];

  return [
    `<title>${esc(c.title)}</title>`,
    `<link rel="canonical" href="${esc(c.url)}" />`,
    ...tags.map(([k, v]) => {
      const [attr, name] = k.split("=");

      return `<meta ${attr}="${name}" content="${esc(v)}" />`;
    }),
  ].join("\n    ");
};

// ---- data ----

interface Owner {
  id: string;
  name?: string;
}
interface Face {
  id: string;
  name: string;
  description?: string;
  preview: string;
  collectionId: string;
  updated: string;
  owner?: string;
  expand?: { owner?: Owner };
}

/** Every published watchface, in pages — the collection is a couple hundred records. */
const fetchFaces = async (): Promise<Face[]> => {
  const out: Face[] = [];

  for (let page = 1; ; page++) {
    const url =
      `${PB}/api/collections/watchfaces/records` +
      `?page=${page}&perPage=500&filter=${encodeURIComponent("published = true")}&expand=owner`;
    const res = await fetch(url);

    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    const body = (await res.json()) as { items: Face[]; totalPages: number };

    out.push(...body.items);
    if (page >= body.totalPages) return out;
  }
};

const previewUrl = (f: Face) => `${PB}/api/files/${f.collectionId}/${f.id}/${f.preview}`;

// ---- output ----

/** Write `html` where Caddy's `try_files {path} {path}/index.html` will find it for `route`. */
const writeStub = async (route: string, html: string) => {
  const dir = join(BUILD, route);

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), html);
};

// A pair rather than a single marker, so the block stays replaceable: running this twice over
// one build/ is then a no-op rewrite instead of a crash.
const REGION = /<!--seo:start-->[\s\S]*?<!--seo:end-->/;

const shell = await readFile(join(BUILD, "index.html"), "utf8");

if (!REGION.test(shell))
  throw new Error(
    "<!--seo:start--> … <!--seo:end--> not found in build/index.html — is the pair still in src/app.html?",
  );

const withCard = (c: Card) =>
  shell.replace(REGION, `<!--seo:start-->\n    ${metaBlock(c)}\n    <!--seo:end-->`);

const siteCard: Card = {
  title: siteTitle(),
  description: siteDesc(),
  url: `${SITE}/`,
  image: DEFAULT_IMAGE,
  imageAlt: DEFAULT_ALT,
};

// the shell is the fallback for every route that has no stub of its own, so it carries the
// site-wide card — a face published since the last deploy unfurls as FMC rather than as nothing
await writeFile(join(BUILD, "index.html"), withCard(siteCard));

let faces: Face[] = [];

try {
  faces = await fetchFaces();
} catch (e) {
  // a backend blip must not fail a deploy: the site-wide card above is already written, and
  // the sitemap below degrades to the static routes
  console.warn(`seo: could not reach ${PB} — per-face cards skipped (${(e as Error).message})`);
}

for (const f of faces) {
  await writeStub(
    `market/${f.id}`,
    withCard({
      title: faceTitle(f.name),
      description: oneLine(faceDesc(f.description || "", f.expand?.owner?.name)),
      url: `${SITE}/market/${f.id}`,
      image: previewUrl(f),
      imageAlt: `The ${f.name} watchface`,
      square: true,
    }),
  );
}

const creators = new Map<string, Owner>();

for (const f of faces) if (f.expand?.owner) creators.set(f.expand.owner.id, f.expand.owner);

for (const [id, c] of creators) {
  const name = c.name || "A creator";

  await writeStub(
    `user/${id}`,
    withCard({
      title: creatorTitle(name),
      description: oneLine(creatorDesc(name)),
      url: `${SITE}/user/${id}`,
      image: DEFAULT_IMAGE,
      imageAlt: DEFAULT_ALT,
    }),
  );
}

// ---- sitemap ----

const day = (iso: string) => iso.slice(0, 10);
const newest = faces
  .map((f) => f.updated)
  .sort()
  .at(-1);
const urls = [
  { loc: `${SITE}/`, lastmod: newest && day(newest) },
  { loc: `${SITE}/editor` },
  ...faces.map((f) => ({ loc: `${SITE}/market/${f.id}`, lastmod: day(f.updated) })),
  ...[...creators.keys()].map((id) => ({ loc: `${SITE}/user/${id}` })),
];

await writeFile(
  join(BUILD, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    ({ loc, lastmod }) =>
      `  <url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`,
  )
  .join("\n")}
</urlset>
`,
);

console.log(
  `seo: ${faces.length} watchface + ${creators.size} creator stubs, ${urls.length} sitemap urls`,
);
