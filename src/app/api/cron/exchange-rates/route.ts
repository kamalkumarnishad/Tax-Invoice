import { env } from "@/config/env";
import { isCronRequest } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { refreshRates } from "@/server/services/currency-analyzer/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Called once a day by the host's scheduler, see vercel.json. */
export async function GET(request: Request) {
  if (!isCronRequest(request, env.CRON_SECRET)) return Response.json({ error: "Not allowed" }, { status: 401 });

  const result = await refreshRates(await getDb(), { now: new Date() });
  return Response.json(result, { status: result.failed.length > 0 ? 500 : 200 });
}
