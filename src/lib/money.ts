// Money is always stored and moved as integer cents to avoid float drift.
// These helpers are the only place euros<->cents conversion should happen.

export function eurosToCents(euros: number): number {
  return Math.round(euros * 100);
}

export function centsToEuros(cents: number): number {
  return cents / 100;
}

/**
 * Parse a free-text money amount such as "150", "€150", "150.50", or
 * "1,250.00" into integer cents. Returns null when nothing usable is found.
 */
export function parseAmountToCents(input: string | number): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? eurosToCents(input) : null;
  }

  const cleaned = input.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  if (cleaned === "") return null;

  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? eurosToCents(value) : null;
}

export function formatCents(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
  }).format(cents / 100);
}
