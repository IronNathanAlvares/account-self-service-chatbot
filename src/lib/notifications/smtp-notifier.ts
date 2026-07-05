import nodemailer from "nodemailer";

import type {
  AccountChangeNotification,
  AccountChangeNotificationResult,
} from "@/lib/notifications/account-change-notification";
import type { Notifier } from "@/lib/notifications/notifier";
import { buildAccountPdf } from "@/lib/notifications/pdf/build-account-pdf";
import { encryptPdf, pdfPasswordFromPhone } from "@/lib/notifications/pdf/encrypt-pdf";
import { redactEmail } from "@/lib/redact";

// Generic SMTP notifier. Works with any SMTP provider - Gmail, Brevo, Mailjet,
// SendGrid, SMTP2GO, etc. - none of which restrict recipients the way Resend's
// shared sandbox sender does, so this can deliver the encrypted PDF to ANY
// email the customer provides. Selected when SMTP_HOST is set.
//
// Gmail example env:
//   SMTP_HOST=smtp.gmail.com  SMTP_PORT=587  SMTP_SECURE=false
//   SMTP_USER=you@gmail.com   SMTP_PASS=<16-char app password>
//   SMTP_FROM=Account Portal <you@gmail.com>

const GENERIC_BODY =
  "There has been a change to your account. For your security, the details are in the attached PDF. Open it with the last 4 digits of the phone number on your account.";

export class SmtpNotifier implements Notifier {
  private transporter: nodemailer.Transporter;
  private fromEmail: string;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: (process.env.SMTP_SECURE ?? "false") === "true", // true for port 465
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    this.fromEmail = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "";
  }

  async send(
    notification: AccountChangeNotification,
  ): Promise<AccountChangeNotificationResult> {
    const ctx = notification.accountSnapshot;
    const password = pdfPasswordFromPhone(ctx.account.phone);
    const pdfBytes = await buildAccountPdf(ctx);
    const encrypted = await encryptPdf(pdfBytes, password);

    // A user-specified receipt email wins; else the dev override redirects the
    // (fake) account email to a real inbox; else the account email.
    const recipient =
      notification.recipientOverride ||
      process.env.NOTIFICATION_TEST_OVERRIDE_EMAIL ||
      ctx.account.email;

    try {
      const info = await this.transporter.sendMail({
        from: this.fromEmail,
        to: recipient,
        cc: notification.ccOverride,
        subject: "An update was made to your account",
        text: GENERIC_BODY,
        attachments: [{ filename: "account-summary.pdf", content: Buffer.from(encrypted) }],
      });
      return {
        notificationId: info.messageId ?? `smtp_${Date.now()}`,
        sent: true,
        redactedRecipient: redactEmail(recipient),
      };
    } catch (error) {
      console.error("[smtp] send failed:", error instanceof Error ? error.message : "unknown");
      return { notificationId: "", sent: false, redactedRecipient: redactEmail(recipient) };
    }
  }
}
