import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { getUserDefaults } from "@/server/queries/settings";
import { exportRecords } from "@/server/services/export";
import { parseRange } from "@/validations/reports";

const kinds = z.enum(["income", "expenses"]);

const refuse = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return refuse("Sign in first.", 401);
  // Another site must not be able to make the browser ask for this.
  if (request.headers.get("sec-fetch-site") === "cross-site") return refuse("Open this from the Reports page.", 403);

  const params = new URL(request.url).searchParams;
  const kind = kinds.safeParse(params.get("kind"));
  const from = params.get("from");
  const to = params.get("to");
  if (!kind.success || !from || !to) return refuse("Choose what to export and two dates.", 400);

  const { today } = await getUserDefaults(session.user.id);
  const { error, ...range } = parseRange({ from, to }, today);
  if (error) return refuse(error, 400);

  const result = await withUser(session.user.id, (tx) => exportRecords(tx, session.user.id, kind.data, range));
  if (!result.ok) return refuse(result.error, 400);

  return new Response(result.data, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind.data}-${range.from}-to-${range.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
