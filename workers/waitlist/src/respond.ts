export type ErrorCode =
  | "invalid_email"
  | "bad_request"
  | "too_large"
  | "rate_limited"
  | "forbidden_origin"
  | "server_error"
  | "not_found";

const ERROR_STATUS: Record<ErrorCode, number> = {
  invalid_email: 400,
  bad_request: 400,
  too_large: 413,
  rate_limited: 429,
  forbidden_origin: 403,
  server_error: 500,
  not_found: 404,
};

export function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  extraHeaders: HeadersInit = {},
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

export function okResponse(cors: HeadersInit = {}): Response {
  return jsonResponse({ ok: true }, 200, cors);
}

export function errorResponse(
  error: ErrorCode,
  extraHeaders: HeadersInit = {},
): Response {
  const headers = new Headers(extraHeaders);
  if (error === "rate_limited") {
    headers.set("Retry-After", "60");
  }
  return jsonResponse({ ok: false, error }, ERROR_STATUS[error], headers);
}

export function methodNotAllowed(extraHeaders: HeadersInit = {}): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Allow", "POST, OPTIONS");
  return jsonResponse({ ok: false }, 405, headers);
}

export function deniedOriginHeaders(): HeadersInit {
  return { Vary: "Origin" };
}

export function corsHeaders(origin: string | null): HeadersInit {
  if (origin === null || origin === "") {
    return { Vary: "Origin" };
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
