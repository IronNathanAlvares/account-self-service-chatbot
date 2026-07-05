import type {
  AccountChangeNotification,
  AccountChangeNotificationResult,
} from "@/lib/notifications/account-change-notification";
import { redactEmail, redactChangeSummary } from "@/lib/redact";

// The notification boundary. Business code depends on this interface only, so
// tests inject a fake and never touch Resend or generate real PDFs.

export interface Notifier {
  send(
    notification: AccountChangeNotification,
  ): Promise<AccountChangeNotificationResult>;
}

/**
 * Local/dev + test-friendly notifier. Logs a REDACTED summary only — no email,
 * no PDF, no sensitive values. Used automatically when Resend is not configured.
 */
export class LoggingNotifier implements Notifier {
  async send(
    notification: AccountChangeNotification,
  ): Promise<AccountChangeNotificationResult> {
    const recipient = redactEmail(notification.accountSnapshot.account.email);
    console.info(
      `[notification] action=${redactChangeSummary(notification.changeSummary)} to=${recipient} (logged, not sent)`,
    );
    return {
      notificationId: `log_${Date.now()}`,
      sent: false,
      redactedRecipient: recipient,
    };
  }
}

/** Spy notifier for tests: records calls without any side effects. */
export class RecordingNotifier implements Notifier {
  public readonly calls: AccountChangeNotification[] = [];

  async send(
    notification: AccountChangeNotification,
  ): Promise<AccountChangeNotificationResult> {
    this.calls.push(notification);
    return {
      notificationId: `rec_${this.calls.length}`,
      sent: true,
      redactedRecipient: redactEmail(notification.accountSnapshot.account.email),
    };
  }
}
