# focx-site

Static umbrella for **focx.ai** — landing page plus path mounts (e.g. `/skills/connect` from [`focx-connect`](https://github.com/ryanphillipthomas/focx-connect)).

## Layout

```
apps/site/              → focx.ai /
workers/waitlist/       → Cloudflare Worker + D1 waitlist API (not deployed from this tree)
tools/site-compose/     → copies apps/site + remote mounts into dist/
render.yaml             → Render static site
docs/connect-extract.md → Connect product extract notes (optional)
```

## Build

```bash
node tools/site-compose/index.mjs
# → dist/
```

## Deploy

Render uses `render.yaml` (`buildCommand: node tools/site-compose/index.mjs`, publish `dist/`).

Desk tooling (Drift Check, etc.) lives in [`ryanthomas-tools`](https://github.com/ryanphillipthomas/ryanthomas-tools), not here.
