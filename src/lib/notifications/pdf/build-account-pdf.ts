import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { AccountContext } from "@/lib/account/types";
import { formatCents } from "@/lib/money";

// Builds the *unencrypted* account-summary PDF with pdf-lib. Encryption is a
// separate step (encrypt-pdf.ts). This is the sensitive attachment, so its
// contents must never appear in the email body or in logs.

export async function buildAccountPdf(ctx: AccountContext): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([595, 842]); // A4
  let y = 800;
  const left = 48;

  const line = (text: string, opts: { bold?: boolean; size?: number } = {}) => {
    const size = opts.size ?? 11;
    if (y < 60) {
      page = doc.addPage([595, 842]);
      y = 800;
    }
    page.drawText(text, {
      x: left,
      y,
      size,
      font: opts.bold ? bold : font,
      color: rgb(0.1, 0.12, 0.18),
    });
    y -= size + 8;
  };

  const a = ctx.account;
  line("Account Summary", { bold: true, size: 20 });
  line(`${a.accountHolderFirstName} ${a.accountHolderLastName}  ·  ${a.reference}`);
  line(`Creditor: ${a.creditorName}`);
  y -= 6;

  line("Contact details", { bold: true, size: 14 });
  line(`Email: ${a.email}`);
  line(`Phone: ${a.phone}`);
  line(
    `Address: ${[a.address.line1, a.address.line2, a.address.city, a.address.postalCode, a.address.country].filter(Boolean).join(", ")}`,
  );
  line(`Preferred contact: ${a.preferredContactMethod.toUpperCase()}`);
  y -= 6;

  line("Balance", { bold: true, size: 14 });
  line(`Current balance: ${formatCents(a.balanceCents, a.currency)}`);
  y -= 6;

  line("Related people", { bold: true, size: 14 });
  if (ctx.relatedPeople.length === 0) line("None on file.");
  for (const p of ctx.relatedPeople) {
    line(`${p.name} (${p.relationship ?? "related"}) — ${p.authorizedToAct ? "authorized" : "not authorized"}`);
  }
  y -= 6;

  line("Promises to pay", { bold: true, size: 14 });
  if (ctx.promisesToPay.length === 0) line("None on file.");
  for (const promise of ctx.promisesToPay) {
    line(`${formatCents(promise.amountCents, promise.currency)} due ${promise.dueDate} (${promise.status})`);
  }
  y -= 6;

  line("Transactions", { bold: true, size: 14 });
  if (ctx.transactions.length === 0) line("None on file.");
  for (const t of ctx.transactions) {
    line(`${t.transactionDate}  ${t.type}  ${formatCents(t.amountCents, t.currency)}  (${t.status}) — ${t.description}`);
  }
  y -= 6;

  line("Future call appointments", { bold: true, size: 14 });
  if (ctx.callAppointments.length === 0) line("None on file.");
  for (const c of ctx.callAppointments) {
    line(`${c.scheduledAt} — ${c.phone} (${c.status})${c.reason ? ` — ${c.reason}` : ""}`);
  }

  return doc.save();
}
