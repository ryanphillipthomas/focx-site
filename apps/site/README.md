# focx.ai — umbrella root

Waitlist at `/` and privacy policy at `/privacy`. Served at `focx.ai/` via `tools/site-compose` (see `render.yaml`). `/skills/connect` is a remote mount, not this folder.

The waitlist POST target is configured in `waitlist-config.js` (same-origin `/api/waitlist` in production; `previewBase` for Render PR previews).
