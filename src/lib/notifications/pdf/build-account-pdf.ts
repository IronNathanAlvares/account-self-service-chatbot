import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

import type { AccountContext } from "@/lib/account/types";
import { formatCents } from "@/lib/money";

// Builds the *unencrypted* account-summary PDF with pdf-lib. Encryption is a
// separate step (encrypt-pdf.ts). This is the sensitive attachment, so its
// contents must never appear in the email body or in logs.

const NAVY = rgb(0.06, 0.11, 0.24);
const ACCENT = rgb(0.17, 0.3, 0.55);
const INK = rgb(0.1, 0.12, 0.18);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.85, 0.87, 0.9);
const ZEBRA = rgb(0.96, 0.97, 0.985);
const WHITE = rgb(1, 1, 1);

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

export async function buildAccountPdf(ctx: AccountContext): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const a = ctx.account;
  const generatedAt = new Date().toLocaleString("en-IE");

  const state = { page: doc.addPage([PAGE_W, PAGE_H]), y: 0 };

  const newPage = () => {
    state.page = doc.addPage([PAGE_W, PAGE_H]);
    state.y = PAGE_H - MARGIN;
  };

  const ensure = (needed: number) => {
    if (state.y - needed < MARGIN + 30) newPage();
  };

  const text = (
    s: string,
    x: number,
    y: number,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
  ) => {
    state.page.drawText(s, {
      x,
      y,
      size: opts.size ?? 10.5,
      font: opts.bold ? bold : font,
      color: opts.color ?? INK,
    });
  };

  const rightText = (
    s: string,
    rightX: number,
    y: number,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const f = opts.bold ? bold : font;
    const size = opts.size ?? 10.5;
    text(s, rightX - f.widthOfTextAtSize(s, size), y, opts);
  };

  // ---- header band ---------------------------------------------------------
  state.page.drawRectangle({ x: 0, y: PAGE_H - 104, width: PAGE_W, height: 104, color: NAVY });
  text("ACCOUNT SUMMARY", MARGIN, PAGE_H - 52, { size: 22, bold: true, color: WHITE });
  text(a.creditorName, MARGIN, PAGE_H - 74, { size: 11, color: rgb(0.8, 0.85, 0.92) });
  rightText("CONFIDENTIAL", PAGE_W - MARGIN, PAGE_H - 44, { size: 9, bold: true, color: rgb(0.7, 0.78, 0.9) });
  rightText(`Generated ${generatedAt}`, PAGE_W - MARGIN, PAGE_H - 60, { size: 8.5, color: rgb(0.7, 0.78, 0.9) });

  state.y = PAGE_H - 104 - 28;

  // ---- account holder + balance card --------------------------------------
  text(`${a.accountHolderFirstName} ${a.accountHolderLastName}`, MARGIN, state.y, { size: 16, bold: true });
  text(`Reference ${a.reference}  ·  Status: ${a.status}`, MARGIN, state.y - 18, { size: 9.5, color: MUTED });

  const cardW = 190;
  const cardX = PAGE_W - MARGIN - cardW;
  state.page.drawRectangle({ x: cardX, y: state.y - 26, width: cardW, height: 52, color: ZEBRA, borderColor: LINE, borderWidth: 1 });
  text("CURRENT BALANCE", cardX + 14, state.y + 12, { size: 8, bold: true, color: MUTED });
  text(formatCents(a.balanceCents, a.currency), cardX + 14, state.y - 10, { size: 18, bold: true, color: NAVY });

  state.y -= 58;

  const sectionHeader = (title: string) => {
    ensure(40);
    state.y -= 8;
    state.page.drawRectangle({ x: MARGIN, y: state.y - 2, width: 4, height: 14, color: ACCENT });
    text(title.toUpperCase(), MARGIN + 12, state.y, { size: 11, bold: true, color: NAVY });
    state.y -= 10;
    state.page.drawLine({ start: { x: MARGIN, y: state.y }, end: { x: PAGE_W - MARGIN, y: state.y }, thickness: 1, color: LINE });
    state.y -= 16;
  };

  const kv = (label: string, value: string) => {
    ensure(16);
    text(label, MARGIN, state.y, { size: 9.5, color: MUTED });
    text(value, MARGIN + 130, state.y, { size: 10 });
    state.y -= 16;
  };

  // ---- contact details -----------------------------------------------------
  sectionHeader("Contact details");
  kv("Email", a.email);
  kv("Phone", a.phone);
  kv("Address", [a.address.line1, a.address.line2, a.address.city, a.address.postalCode, a.address.country].filter(Boolean).join(", "));
  kv("Preferred contact", a.preferredContactMethod.toUpperCase());

  // ---- related people ------------------------------------------------------
  sectionHeader("Related people");
  if (ctx.relatedPeople.length === 0) {
    text("None on file.", MARGIN, state.y, { size: 10, color: MUTED });
    state.y -= 16;
  }
  for (const p of ctx.relatedPeople) {
    ensure(16);
    text(p.name, MARGIN, state.y, { size: 10, bold: true });
    text(`${p.relationship ?? "related"}  ·  ${p.email}  ·  ${p.phone}`, MARGIN + 130, state.y, { size: 9, color: MUTED });
    rightText(p.authorizedToAct ? "Authorized" : "Not authorized", PAGE_W - MARGIN, state.y, { size: 9, bold: true, color: p.authorizedToAct ? ACCENT : MUTED });
    state.y -= 16;
  }

  // ---- promises to pay -----------------------------------------------------
  sectionHeader("Promises to pay");
  if (ctx.promisesToPay.length === 0) {
    text("None on file.", MARGIN, state.y, { size: 10, color: MUTED });
    state.y -= 16;
  }
  for (const promise of ctx.promisesToPay) {
    ensure(16);
    text(formatCents(promise.amountCents, promise.currency), MARGIN, state.y, { size: 10, bold: true });
    text(`due ${promise.dueDate}`, MARGIN + 130, state.y, { size: 10, color: MUTED });
    rightText(promise.status, PAGE_W - MARGIN, state.y, { size: 9, color: MUTED });
    state.y -= 16;
  }

  // ---- transactions table --------------------------------------------------
  sectionHeader("Transactions");
  drawTableHeader(state, font, bold);
  ctx.transactions.forEach((t, i) => {
    ensure(18);
    if (i % 2 === 1) {
      state.page.drawRectangle({ x: MARGIN, y: state.y - 4, width: CONTENT_W, height: 16, color: ZEBRA });
    }
    text(t.transactionDate, MARGIN + 4, state.y, { size: 9 });
    text(t.description, MARGIN + 96, state.y, { size: 9 });
    text(t.type, MARGIN + 300, state.y, { size: 9, color: MUTED });
    rightText(formatCents(t.amountCents, t.currency), PAGE_W - MARGIN - 70, state.y, { size: 9, bold: true });
    rightText(t.status, PAGE_W - MARGIN - 4, state.y, { size: 9, color: MUTED });
    state.y -= 16;
  });

  // ---- future call appointments -------------------------------------------
  sectionHeader("Future call appointments");
  if (ctx.callAppointments.length === 0) {
    text("None on file.", MARGIN, state.y, { size: 10, color: MUTED });
    state.y -= 16;
  }
  for (const c of ctx.callAppointments) {
    ensure(16);
    text(new Date(c.scheduledAt).toLocaleString("en-IE"), MARGIN, state.y, { size: 10 });
    text(`${c.phone}  ·  ${c.status}${c.reason ? `  ·  ${c.reason}` : ""}`, MARGIN + 180, state.y, { size: 9, color: MUTED });
    state.y -= 16;
  }

  // ---- footer on every page ------------------------------------------------
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    page.drawLine({ start: { x: MARGIN, y: 44 }, end: { x: PAGE_W - MARGIN, y: 44 }, thickness: 1, color: LINE });
    page.drawText("Confidential account summary. Keep this document secure.", { x: MARGIN, y: 30, size: 8, font, color: MUTED });
    const label = `Page ${i + 1} of ${pages.length}`;
    page.drawText(label, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(label, 8), y: 30, size: 8, font, color: MUTED });
  });

  return doc.save();
}

function drawTableHeader(
  state: { page: PDFPage; y: number },
  font: PDFFont,
  bold: PDFFont,
) {
  const cols: Array<[string, number, boolean]> = [
    ["DATE", MARGIN + 4, false],
    ["DESCRIPTION", MARGIN + 96, false],
    ["TYPE", MARGIN + 300, false],
  ];
  for (const [label, x] of cols) {
    state.page.drawText(label, { x, y: state.y, size: 8, font: bold, color: MUTED });
  }
  state.page.drawText("AMOUNT", { x: PAGE_W - MARGIN - 70 - bold.widthOfTextAtSize("AMOUNT", 8), y: state.y, size: 8, font: bold, color: MUTED });
  state.page.drawText("STATUS", { x: PAGE_W - MARGIN - 4 - bold.widthOfTextAtSize("STATUS", 8), y: state.y, size: 8, font: bold, color: MUTED });
  state.y -= 6;
  state.page.drawLine({ start: { x: MARGIN, y: state.y }, end: { x: PAGE_W - MARGIN, y: state.y }, thickness: 1, color: LINE });
  state.y -= 14;
}
