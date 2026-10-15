export type NormalizedEmail = string & { readonly __brand: "NormalizedEmail" };

const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
const LOCAL_CHARS = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeEmail(raw: unknown): NormalizedEmail | null {
  if (typeof raw !== "string") {
    return null;
  }

  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) {
    return null;
  }

  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) {
    return null;
  }

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length === 0 || local.length > MAX_LOCAL_LENGTH) {
    return null;
  }
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return null;
  }
  if (!LOCAL_CHARS.test(local)) {
    return null;
  }

  const labels = domain.split(".");
  if (labels.length < 2) {
    return null;
  }
  for (const label of labels) {
    if (!DNS_LABEL.test(label)) {
      return null;
    }
  }
  const tld = labels[labels.length - 1];
  if (tld === undefined || tld.length < 2) {
    return null;
  }

  return email as NormalizedEmail;
}
