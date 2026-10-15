import { normalizeEmail } from "./email";
import { compileAllowlist, originAllowed } from "./origin";
import { corsHeaders, errorResponse, methodNotAllowed, okResponse } from "./respond";

const WAITLIST_PATH = "/api/waitlist";
const MAX_BODY_BYTES = 1024;
const INSERT_SQL = "INSERT INTO waitlist (email) VALUES (?) ON CONFLICT(email) DO NOTHING";

function isJsonContentType(value: string | null): boolean {
  if (value === null) {
    return false;
  }
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}

function honeypotFilled(website: unknown): boolean {
  if (website === undefined || website === null) {
    return false;
  }
  if (typeof website === "string") {
    return website.trim() !== "";
  }
  return true;
}

function contentLengthExceedsLimit(request: Request): boolean {
  const raw = request.headers.get("content-length");
  if (raw === null) {
    return false;
  }
  const length = Number(raw);
  return Number.isFinite(length) && length > MAX_BODY_BYTES;
}

async function readJsonObject(
  request: Request,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: "too_large" | "bad_request" }> {
  if (contentLengthExceedsLimit(request)) {
    return { ok: false, error: "too_large" };
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    return { ok: false, error: "bad_request" };
  }
  if (buffer.byteLength > MAX_BODY_BYTES) {
    return { ok: false, error: "too_large" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    return { ok: false, error: "bad_request" };
  }
  if (!isJsonObject(parsed)) {
    return { ok: false, error: "bad_request" };
  }
  return { ok: true, value: parsed };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function rateLimited(request: Request, env: WaitlistEnv): Promise<boolean> {
  const ip = request.headers.get("cf-connecting-ip");
  if (ip === null || ip === "") {
    return false;
  }
  const { success } = await env.WAITLIST_RATE_LIMITER.limit({ key: ip });
  return !success;
}

export type WaitlistEnv = {
  DB: Pick<D1Database, "prepare">;
  WAITLIST_RATE_LIMITER: Pick<RateLimit, "limit">;
  EXTRA_ALLOWED_ORIGINS: string;
};

export async function handleWaitlist(request: Request, env: WaitlistEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== WAITLIST_PATH) {
    return errorResponse("not_found");
  }

  const origin = request.headers.get("Origin");
  let cors: HeadersInit = {};
  try {
    const rules = compileAllowlist(env.EXTRA_ALLOWED_ORIGINS);
    const allowed = originAllowed({ origin, requestUrl: url, rules });
    if (!allowed) {
      return errorResponse("forbidden_origin", corsHeaders(origin));
    }

    cors = corsHeaders(origin);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return methodNotAllowed(cors);
    }

    if (await rateLimited(request, env)) {
      return errorResponse("rate_limited", cors);
    }

    if (!isJsonContentType(request.headers.get("Content-Type"))) {
      return errorResponse("bad_request", cors);
    }

    const body = await readJsonObject(request);
    if (!body.ok) {
      return errorResponse(body.error, cors);
    }

    if (honeypotFilled(body.value.website)) {
      return okResponse(cors);
    }

    const email = normalizeEmail(body.value.email);
    if (email === null) {
      return errorResponse("invalid_email", cors);
    }

    await env.DB.prepare(INSERT_SQL).bind(email).run();
    return okResponse(cors);
  } catch {
    return errorResponse("server_error", cors);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    return handleWaitlist(request, env);
  },
} satisfies ExportedHandler<Env>;
