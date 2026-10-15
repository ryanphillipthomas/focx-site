export type OriginRule =
  | { readonly kind: "exact"; readonly origin: string }
  | { readonly kind: "regex"; readonly pattern: RegExp };

export const PRODUCTION_ORIGINS = [
  "https://focx.ai",
  "https://www.focx.ai",
] as const;

const MAX_ORIGIN_LENGTH = 256;
const MAX_REGEX_SOURCE_LENGTH = 256;

type CompiledAllowlist = {
  readonly source: string;
  readonly rules: readonly OriginRule[];
};

let compiled: CompiledAllowlist | null = null;

function compileAnchoredRegex(entry: string): RegExp | null {
  if (!entry.startsWith("^") || !entry.endsWith("$")) {
    return null;
  }
  if (entry.length > MAX_REGEX_SOURCE_LENGTH) {
    return null;
  }
  const inner = entry.slice(1, -1);
  if (inner.length === 0) {
    return null;
  }
  try {
    return new RegExp(`^(?:${inner})$`);
  } catch {
    return null;
  }
}

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
      const pattern = compileAnchoredRegex(entry);
      if (pattern !== null) {
        rules.push({ kind: "regex", pattern });
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
    switch (rule.kind) {
      case "exact":
        if (rule.origin === origin) {
          return true;
        }
        break;
      case "regex":
        if (rule.pattern.test(origin)) {
          return true;
        }
        break;
      default: {
        const _exhaustive: never = rule;
        return _exhaustive;
      }
    }
  }
  return false;
}
