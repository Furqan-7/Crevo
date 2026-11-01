import { env, features } from "../config/env";
import { AppError } from "../utils/AppError";

// Sends email through Resend (https://resend.com). EMAIL_FROM must be an
// address on a domain verified in Resend.
export async function sendEmail(mail: { to: string; subject: string; html: string; text: string }) {
  if (!features.email) throw new AppError(503, "EMAIL_NOT_CONFIGURED", "Email isn't set up on this server yet.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`email send failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
}
