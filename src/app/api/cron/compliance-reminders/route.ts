import { env } from "@/config/env";
import { isCronRequest } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { sendReminders } from "@/server/services/compliance/reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Called once a day by the host's scheduler, see vercel.json. */
export async function GET(request: Request) {
  if (!isCronRequest(request, env.CRON_SECRET)) return Response.json({ error: "Not allowed" }, { status: 401 });

  const result = await sendReminders(await getDb(), {
    now: new Date(),
    baseURL: env.BETTER_AUTH_URL ?? "http://localhost:3000",
    sendEmail,
  });
  return Response.json(result, { status: result.failed > 0 ? 500 : 200 });
}
