import "server-only";
import { env } from "@/config/env";

export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    // Development only: env validation requires both in production.
    console.info(`\n[email not sent, no RESEND_API_KEY]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}
