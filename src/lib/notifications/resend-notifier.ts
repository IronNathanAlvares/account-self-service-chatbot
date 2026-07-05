import { Resend } from "resend";

import type {
  AccountChangeNotification,
  AccountChangeNotificationResult,
} from "@/lib/notifications/account-change-notification";
import type { Notifier } from "@/lib/notifications/notifier";
import { buildAccountPdf } from "@/lib/notifications/pdf/build-account-pdf";
import { encryptPdf, pdfPasswordFromPhone } from "@/lib/notifications/pdf/encrypt-pdf";
import { redactEmail } from "@/lib/redact";

// Production notifier. Sends a GENERIC email (no sensitive detail in the body)
// with the sensitive account summary as an ENCRYPTED PDF attachment.
//
// TODO(day-2): verify the encrypted PDF opens with the phone last-4 password in
// a real deploy, and persist the outcome to notification_attempts.

const GENERIC_BODY =
  "There has been a change to your account. For your security, the details are in the attached PDF. Open it with the last 4 digits of the phone number on your account.";

export class ResendNotifier implements Notifier {
  private client: Resend;
  private fromEmail: string;

  constructor(opts?: { apiKey?: string; fromEmail?: string }) {
    this.client = new Resend(opts?.apiKey ?? process.env.RESEND_API_KEY);
    this.fromEmail =
      opts?.fromEmail ??
      process.env.NOTIFICATION_FROM_EMAIL ??
      "Account Portal <notifications@example.test>";
  }

  async send(
    notification: AccountChangeNotification,
  ): Promise<AccountChangeNotificationResult> {
    const ctx = notification.accountSnapshot;
    const password = pdfPasswordFromPhone(ctx.account.phone);

    const pdfBytes = await buildAccountPdf(ctx);
    const encrypted = await encryptPdf(pdfBytes, password);

    // Recipient precedence: a user-specified receipt email wins; otherwise the
    // dev test-override redirects the (fake) account email to the owner;
    // otherwise the account email itself.
    const recipient =
      notification.recipientOverride ||
      process.env.NOTIFICATION_TEST_OVERRIDE_EMAIL ||
      ctx.account.email;

    const { data, error } = await this.client.emails.send({
      from: this.fromEmail,
      to: recipient,
      subject: "An update was made to your account",
      text: GENERIC_BODY,
      attachments: [
        {
          filename: "account-summary.pdf",
          content: Buffer.from(encrypted),
        },
      ],
    });

    if (error) {
      // Never leak the address; a common cause is sending to a non-owner while
      // still using Resend's shared onboarding@resend.dev sender.
      console.error("[resend] send failed:", error.message);
      return {
        notificationId: `resend_error_${Date.now()}`,
        sent: false,
        redactedRecipient: redactEmail(recipient),
      };
    }

    return {
      notificationId: data?.id ?? `resend_${Date.now()}`,
      sent: true,
      redactedRecipient: redactEmail(recipient),
    };
  }
}
