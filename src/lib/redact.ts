// Redaction helpers. Account data is sensitive: never log full emails, phone
// numbers, addresses, or PDF passwords. Use these before any console/DB log.

export function redactEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
}

export function redactPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-2)}`;
}

/** Password source for the encrypted PDF must never be logged in full. */
export function redactSecret(secret: string): string {
  return secret ? `***(${secret.length} chars)` : "***";
}

/**
 * Produce a log-safe summary of a change. Deliberately omits the actual new
 * values for sensitive fields - logs should say *what* changed, not the value.
 */
export function redactChangeSummary(summary: string): string {
  return summary
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, (m) => redactEmail(m))
    .replace(/\+?\d[\d\s-]{6,}\d/g, (m) => redactPhone(m));
}
