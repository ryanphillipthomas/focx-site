import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { handleWaitlist } from "../src/index";

const WORKER_ORIGIN = "https://focx-waitlist-preview.example.workers.dev";
const WAITLIST_URL = `${WORKER_ORIGIN}/api/waitlist`;
const PREVIEW_ORIGIN = "https://focx-waitlist-preview.onrender.com";
const PREVIEW_LOOKALIKE = "https://focx-waitlist-preview.onrender.com.evil.com";
const SITE_PREVIEW_REGEX =
  "^https://focx-site-preview(-[a-z0-9]+)?-pr-[0-9]+\\.onrender\\.com$";

type JoinOptions = {
  origin?: string | null;
  ip?: string;
  contentType?: string | null;
  body?: BodyInit | null;
  method?: string;
  url?: string;
};

function join(options: JoinOptions = {}): Request {
  const headers = new Headers();
  if (options.origin !== null) {
    headers.set("Origin", options.origin ?? PREVIEW_ORIGIN);
  }
  if (options.ip !== undefined) {
    headers.set("cf-connecting-ip", options.ip);
  }
  if (options.contentType !== null) {
    headers.set("Content-Type", options.contentType ?? "application/json");
  }
  return new Request(options.url ?? WAITLIST_URL, {
    method: options.method ?? "POST",
    headers,
    body: options.body === undefined ? JSON.stringify({ email: "join@example.com" }) : options.body,
  });
}

async function jsonOf(response: Response): Promise<unknown> {
  return response.json();
}

async function rowCount(email: string): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM waitlist WHERE email = ?")
    .bind(email)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe("POST /api/waitlist", () => {
  it("inserts a valid email and returns 200 {ok:true}", async () => {
    const response = await exports.default.fetch(
      join({ body: JSON.stringify({ email: "new.user@example.com" }) }),
    );
    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({ ok: true });
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(await rowCount("new.user@example.com")).toBe(1);
  });

  it("returns the same 200 for a duplicate and keeps a single row", async () => {
    const body = JSON.stringify({ email: "dup@example.com" });
    const first = await exports.default.fetch(join({ body, ip: "203.0.113.10" }));
    const second = await exports.default.fetch(join({ body, ip: "203.0.113.11" }));
    expect(first.status).toBe(200);
    expect(await jsonOf(first)).toEqual({ ok: true });
    expect(second.status).toBe(200);
    expect(await jsonOf(second)).toEqual({ ok: true });
    expect(await rowCount("dup@example.com")).toBe(1);
  });

  it("trims and lowercases the email before insert", async () => {
    const response = await exports.default.fetch(
      join({ body: JSON.stringify({ email: "  Foo.Bar+Tag@Example.COM " }) }),
    );
    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({ ok: true });
    expect(await rowCount("foo.bar+tag@example.com")).toBe(1);
    expect(await rowCount("  Foo.Bar+Tag@Example.COM ")).toBe(0);
  });

  it("rejects invalid and missing emails with 400 invalid_email", async () => {
    const cases = [
      {},
      { email: "" },
      { email: "   " },
      { email: "not-an-email" },
      { email: "user@" },
      { email: "@example.com" },
      { email: "user@localhost" },
      { email: "user@example" },
      { email: `${"a".repeat(65)}@example.com` },
      { email: `${"a".repeat(64)}@${"b".repeat(190)}.com` },
      { email: 12 },
    ];
    for (const payload of cases) {
      const response = await exports.default.fetch(join({ body: JSON.stringify(payload) }));
      expect(response.status, JSON.stringify(payload)).toBe(400);
      expect(await jsonOf(response)).toEqual({ ok: false, error: "invalid_email" });
    }
  });

  it("returns 200 and stores nothing when the honeypot is filled", async () => {
    const response = await exports.default.fetch(
      join({
        body: JSON.stringify({ email: "bot@example.com", website: "https://spam.example" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({ ok: true });
    expect(await rowCount("bot@example.com")).toBe(0);

    const spaces = await exports.default.fetch(
      join({
        body: JSON.stringify({ email: "spaces@example.com", website: " " }),
      }),
    );
    expect(spaces.status).toBe(200);
    expect(await jsonOf(spaces)).toEqual({ ok: true });
    expect(await rowCount("spaces@example.com")).toBe(0);
  });

  it("returns 404 not_found for an unknown path", async () => {
    const response = await exports.default.fetch(join({ url: `${WORKER_ORIGIN}/api/other`, body: null }));
    expect(response.status).toBe(404);
    expect(await jsonOf(response)).toEqual({ ok: false, error: "not_found" });
  });

  it("rejects a body over 1 KB with 413 too_large", async () => {
    const response = await exports.default.fetch(
      join({ body: JSON.stringify({ email: "big@example.com", pad: "x".repeat(1100) }) }),
    );
    expect(response.status).toBe(413);
    expect(await jsonOf(response)).toEqual({ ok: false, error: "too_large" });
    expect(await rowCount("big@example.com")).toBe(0);
  });

  it("rejects malformed JSON and a non-object body with 400 bad_request", async () => {
    const malformed = await exports.default.fetch(join({ body: "{not json" }));
    expect(malformed.status).toBe(400);
    expect(await jsonOf(malformed)).toEqual({ ok: false, error: "bad_request" });

    const arrayBody = await exports.default.fetch(join({ body: '["email"]' }));
    expect(arrayBody.status).toBe(400);
    expect(await jsonOf(arrayBody)).toEqual({ ok: false, error: "bad_request" });
  });

  it("rejects the wrong content type with 400 bad_request", async () => {
    const response = await exports.default.fetch(
      join({ contentType: "text/plain", body: '{"email":"ct@example.com"}' }),
    );
    expect(response.status).toBe(400);
    expect(await jsonOf(response)).toEqual({ ok: false, error: "bad_request" });
  });

  it("returns 405 for methods other than POST and OPTIONS", async () => {
    const response = await exports.default.fetch(join({ method: "GET", body: null }));
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST, OPTIONS");
    expect(await jsonOf(response)).toEqual({ ok: false });
  });

  it("handles OPTIONS preflight for an allowed origin", async () => {
    const response = await exports.default.fetch(join({ method: "OPTIONS", body: null }));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(PREVIEW_ORIGIN);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("allows same-origin and missing Origin requests", async () => {
    const sameOrigin = await exports.default.fetch(
      join({
        origin: WORKER_ORIGIN,
        body: JSON.stringify({ email: "same-origin@example.com" }),
      }),
    );
    expect(sameOrigin.status).toBe(200);
    expect(await jsonOf(sameOrigin)).toEqual({ ok: true });

    const noOrigin = await exports.default.fetch(
      join({
        origin: null,
        body: JSON.stringify({ email: "no-origin@example.com" }),
      }),
    );
    expect(noOrigin.status).toBe(200);
    expect(await jsonOf(noOrigin)).toEqual({ ok: true });
  });

  it("allows the exact preview origin and rejects a lookalike host", async () => {
    const allowed = await exports.default.fetch(
      join({
        origin: PREVIEW_ORIGIN,
        body: JSON.stringify({ email: "exact-preview@example.com" }),
      }),
    );
    expect(allowed.status).toBe(200);
    expect(await jsonOf(allowed)).toEqual({ ok: true });
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(PREVIEW_ORIGIN);

    const lookalike = await exports.default.fetch(
      join({
        origin: PREVIEW_LOOKALIKE,
        body: JSON.stringify({ email: "lookalike@example.com" }),
      }),
    );
    expect(lookalike.status).toBe(403);
    expect(await jsonOf(lookalike)).toEqual({ ok: false, error: "forbidden_origin" });
    expect(lookalike.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(await rowCount("lookalike@example.com")).toBe(0);
  });

  it("allows production and preview localhost origins", async () => {
    for (const origin of [
      "https://focx.ai",
      "https://www.focx.ai",
      PREVIEW_ORIGIN,
      "http://localhost:8123",
      "http://127.0.0.1:8123",
    ]) {
      const email = `ok-${origin.replace(/[^a-z0-9]+/g, ".")}@example.com`;
      const response = await exports.default.fetch(
        join({ origin, body: JSON.stringify({ email }) }),
      );
      expect(response.status, origin).toBe(200);
      expect(await jsonOf(response)).toEqual({ ok: true });
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    }
  });

  it("treats EXTRA_ALLOWED_ORIGINS regexes as configurable and anchored", async () => {
    const customEnv = {
      ...env,
      EXTRA_ALLOWED_ORIGINS: `^https://custom-preview-[a-z0-9]+\\.example\\.com$,${SITE_PREVIEW_REGEX}`,
    };
    const allowed = await handleWaitlist(
      join({
        origin: "https://custom-preview-abc.example.com",
        body: JSON.stringify({ email: "custom-allow@example.com" }),
      }),
      customEnv,
    );
    expect(allowed.status).toBe(200);
    expect(await jsonOf(allowed)).toEqual({ ok: true });

    const nearMiss = await handleWaitlist(
      join({
        origin: "https://custom-preview-abc.example.com.evil.com",
        body: JSON.stringify({ email: "custom-deny@example.com" }),
      }),
      customEnv,
    );
    expect(nearMiss.status).toBe(403);
    expect(await jsonOf(nearMiss)).toEqual({ ok: false, error: "forbidden_origin" });
    expect(nearMiss.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(await rowCount("custom-deny@example.com")).toBe(0);

    const alternationEnv = {
      ...env,
      EXTRA_ALLOWED_ORIGINS: "^https://safe.example|https://other.example$",
    };
    const prefixBypass = await handleWaitlist(
      join({
        origin: "https://safe.example.evil.com",
        body: JSON.stringify({ email: "alt-deny@example.com" }),
      }),
      alternationEnv,
    );
    expect(prefixBypass.status).toBe(403);
    expect(await rowCount("alt-deny@example.com")).toBe(0);

    const fullAlt = await handleWaitlist(
      join({
        origin: "https://safe.example",
        body: JSON.stringify({ email: "alt-allow@example.com" }),
      }),
      alternationEnv,
    );
    expect(fullAlt.status).toBe(200);
    expect(await jsonOf(fullAlt)).toEqual({ ok: true });

    const sitePreview = await handleWaitlist(
      join({
        origin: "https://focx-site-preview-pr-12.onrender.com",
        body: JSON.stringify({ email: "site-preview@example.com" }),
      }),
      customEnv,
    );
    expect(sitePreview.status).toBe(200);
    expect(await jsonOf(sitePreview)).toEqual({ ok: true });

    const sitePreviewSuffix = await handleWaitlist(
      join({
        origin: "https://focx-site-preview-ab12cd-pr-99.onrender.com",
        body: JSON.stringify({ email: "site-preview-suffix@example.com" }),
      }),
      customEnv,
    );
    expect(sitePreviewSuffix.status).toBe(200);
    expect(await jsonOf(sitePreviewSuffix)).toEqual({ ok: true });

    const sitePreviewNearMiss = await handleWaitlist(
      join({
        origin: "https://focx-site-preview-pr-12.onrender.com.evil.com",
        body: JSON.stringify({ email: "site-preview-deny@example.com" }),
      }),
      customEnv,
    );
    expect(sitePreviewNearMiss.status).toBe(403);
    expect(await rowCount("site-preview-deny@example.com")).toBe(0);
  });

  it("rejects disallowed and near-miss origins with 403 forbidden_origin", async () => {
    const blocked = [
      "https://evil.com",
      "https://focx.ai.evil.com",
      "https://www.focx.ai.evil.com",
      "https://focx-site-preview-pr-12.onrender.com.evil.com",
      "https://focx-site-preview-ab12cd-pr-99.onrender.com.evil.com",
      "https://evil-focx-site-preview-pr-12.onrender.com",
      "https://focx-site-preview-pr-12.onrender.com.evil.com",
      "http://focx-site-preview-pr-12.onrender.com",
      "https://focx-site-preview-PR-12.onrender.com",
      "https://focx-site-preview-ab-cd-pr-1.onrender.com",
      "https://focx-pr-1.onrender.com",
      PREVIEW_LOOKALIKE,
      "http://localhost:3000",
    ];
    for (const origin of blocked) {
      const response = await exports.default.fetch(
        join({ origin, body: JSON.stringify({ email: "blocked@example.com" }) }),
      );
      expect(response.status, origin).toBe(403);
      expect(await jsonOf(response)).toEqual({ ok: false, error: "forbidden_origin" });
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(await rowCount("blocked@example.com")).toBe(0);
    }
  });

  it("rate-limits the 11th POST from the same connecting IP", async () => {
    const ip = "198.51.100.77";
    for (let i = 0; i < 10; i++) {
      const response = await exports.default.fetch(
        join({
          ip,
          body: JSON.stringify({ email: `burst${i}@example.com` }),
        }),
      );
      expect(response.status).toBe(200);
      expect(await jsonOf(response)).toEqual({ ok: true });
    }
    const limited = await exports.default.fetch(
      join({
        ip,
        body: JSON.stringify({ email: "burst10@example.com" }),
      }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(await jsonOf(limited)).toEqual({ ok: false, error: "rate_limited" });
  });

  it("returns 429 rate_limited with Retry-After when the limiter denies the IP", async () => {
    const limitedEnv = {
      ...env,
      WAITLIST_RATE_LIMITER: {
        async limit() {
          return { success: false };
        },
      },
    };
    const response = await handleWaitlist(join({ ip: "198.51.100.20" }), limitedEnv);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await jsonOf(response)).toEqual({ ok: false, error: "rate_limited" });
  });

  it("returns 500 server_error without internals when D1 fails", async () => {
    const brokenEnv = {
      ...env,
      DB: {
        prepare() {
          throw new Error("d1 exploded with secret details");
        },
      },
    };
    const response = await handleWaitlist(
      join({ body: JSON.stringify({ email: "fail@example.com" }) }),
      brokenEnv,
    );
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ ok: false, error: "server_error" });
    expect(text).not.toContain("secret");
    expect(text).not.toContain("d1 exploded");
  });

  it("exposes only id, email, and created_at on waitlist", async () => {
    const info = await env.DB.prepare("PRAGMA table_info(waitlist)").all<{ name: string }>();
    const columns = info.results.map((row) => row.name).sort();
    expect(columns).toEqual(["created_at", "email", "id"]);
  });
});
