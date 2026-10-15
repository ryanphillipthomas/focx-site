export type OriginRule =
  | { readonly kind: "exact"; readonly origin: string }
  | { readonly kind: "regex"; readonly pattern: RegExp };

export const PRODUCTION_ORIGINS = [
  "https://focx.ai",
  "https://www.focx.ai",
] as const;

const MAX_ORIGIN_LENGTH = 256;

type CompiledAllowlist = {
  readonly source: string;
  readonly rules: readonly OriginRule[];
};

let compiled: CompiledAllowlist | null = null;

export function compileAllowlist(extraAllowedOrigins: string | undefined): readonly OriginRule[] {
  const source = extraAllowedOrigins ?? "";
  if (compiled !== null && compiled.source === source) {
    return compiled.rules;
  }

  const rules: OriginRule[] = PRODUCTION_ORIGINS.map((origin) => ({
    kind: "exact" as const,
    origin,
  }));

  for (const raw of source.split(",")) {
    const entry = raw.trim();
    if (entry.length === 0) {
      continue;
    }
    if (entry.startsWith("^") && entry.endsWith("$")) {
      try {
        rules.push({ kind: "regex", pattern: new RegExp(entry) });
      } catch {
        continue;
      }
      continue;
    }
    rules.push({ kind: "exact", origin: entry });
  }

  compiled = { source, rules };
  return rules;
}

export function originAllowed(params: {
  origin: string | null;
  requestUrl: URL;
  rules: readonly OriginRule[];
}): boolean {
  const { origin, requestUrl, rules } = params;
  if (origin === null || origin === "") {
    return true;
  }
  if (origin.length > MAX_ORIGIN_LENGTH) {
    return false;
  }
  if (origin === requestUrl.origin) {
    return true;
  }
  for (const rule of rules) {
    if (rule.kind === "exact" && rule.origin === origin) {
      return true;
    }
    if (rule.kind === "regex" && rule.pattern.test(origin)) {
      return true;
    }
  }
  return false;
}
