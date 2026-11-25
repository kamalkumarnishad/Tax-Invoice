import { sql } from "drizzle-orm";
import { env } from "@/config/env";
import { isCronRequest } from "@/lib/cron";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "no-store" } };

/**
 * For uptime monitors. Anyone may ask whether the app answers, and that leaves
 * the database asleep. With the cron secret, it checks the database as well.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request, env.CRON_SECRET)) return Response.json({ status: "ok" }, noStore);
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", database: "ok" }, noStore);
  } catch (error) {
    console.error("Health check failed:", error instanceof Error ? error.message : "unknown error");
    return Response.json({ status: "error", database: "error" }, { status: 503, ...noStore });
  }
}
