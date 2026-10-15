/* FOCX WAITLIST ENDPOINT — the single config spot.
 *
 * Production (focx.ai): same-origin POST to `endpoint` (relative `/api/waitlist`).
 *
 * Render PR previews look like:
 *   https://focx-site-preview(-suffix)-pr-<N>.onrender.com
 * Those hosts are not focx.ai, so they need the waitlist Worker origin in
 * `previewBase`. Replace REPLACE_ME when Platform publishes the Worker.
 * Until then, leave the placeholder — the client will keep using `endpoint`
 * rather than calling a host that does not exist.
 *
 * Override either field here. Setting `endpoint` to an absolute URL
 * (https://…) forces that target on every host and skips previewBase.
 */
window.FOCX_WAITLIST = {
  endpoint: '/api/waitlist',
  previewBase: 'https://focx-waitlist-preview.REPLACE_ME.workers.dev',
};
