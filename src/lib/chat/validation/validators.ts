import { z } from "zod";

// Deterministic validation lives here. The LLM proposes fields; this module
// decides whether they are safe to persist. Keep it pure and fully testable.

export const contactMethodSchema = z.enum(["email", "sms", "phone"]);

// Permissive E.164-ish check: optional +, 8-15 digits. Good enough for the
// challenge without a full libphonenumber dependency.
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{8,15}$/u, "Enter a valid phone number, e.g. +353831112233.");

export const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address, e.g. name@example.com.");

export const nonEmptyNameSchema = z
  .string()
  .trim()
  .min(1, "A name is required.")
  .max(120, "That name is too long.");

export const amountCentsSchema = z
  .number()
  .int("Amount must be a whole number of cents.")
  .positive("Amount must be greater than zero.");

export const relatedPersonInputSchema = z.object({
  name: nonEmptyNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  relationship: z.string().trim().max(60).optional(),
  authorizedToAct: z.boolean().default(false),
});

export const addressInputSchema = z.object({
  line1: z.string().trim().min(1),
  line2: z.string().trim().optional(),
  city: z.string().trim().min(1),
  postalCode: z.string().trim().min(1),
  country: z.string().trim().min(1),
});

export const relatedPersonPatchSchema = relatedPersonInputSchema.partial();

export type RelatedPersonInput = z.infer<typeof relatedPersonInputSchema>;
export type AddressInput = z.infer<typeof addressInputSchema>;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export function validate<T>(
  schema: z.ZodType<T>,
  input: unknown,
): ValidationResult<T> {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => issue.message),
  };
}

/**
 * A due/appointment date must be strictly in the future relative to `now`.
 * `now` is injected so tests are deterministic.
 */
export function isFutureDate(dateIso: string, now: Date): boolean {
  const when = new Date(dateIso);
  if (Number.isNaN(when.getTime())) return false;
  return when.getTime() > now.getTime();
}
