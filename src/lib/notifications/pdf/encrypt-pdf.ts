import { encryptPDF } from "@pdfsmaller/pdf-encrypt-lite";

// Pure-JS PDF encryption (RC4 128-bit) that runs on Vercel serverless/edge with
// no native binary. See docs/research/pdf-encryption.md for why this library
// was chosen over qpdf-based alternatives.

/** The PDF password is the last 4 digits of the account holder's phone. */
export function pdfPasswordFromPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-4);
}

export async function encryptPdf(
  pdfBytes: Uint8Array,
  userPassword: string,
): Promise<Uint8Array> {
  // A random owner password locks editing permissions while the user password
  // (phone last-4) opens the file.
  const ownerPassword = `owner-${Math.random().toString(36).slice(2)}`;
  return encryptPDF(pdfBytes, userPassword, ownerPassword);
}
