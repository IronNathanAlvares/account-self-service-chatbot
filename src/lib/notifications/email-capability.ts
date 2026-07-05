// Whether the current email setup can deliver to arbitrary recipients.
//
// Resend's shared sandbox sender (onboarding@resend.dev) can ONLY deliver to
// the account owner's verified address; sending to anyone else is rejected. A
// verified custom domain (a NOTIFICATION_FROM_EMAIL that is not @resend.dev)
// can email any recipient. The app uses this to decide whether to honour a
// custom receipt email or explain the demo limitation instead of failing.

export function emailCanReachAnyRecipient(): boolean {
  const from = process.env.NOTIFICATION_FROM_EMAIL ?? "";
  return Boolean(process.env.RESEND_API_KEY) && from.length > 0 && !from.includes("resend.dev");
}
