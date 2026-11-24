import "server-only";
import { and, eq } from "drizzle-orm";
import { complianceTasks } from "@/db/schema";
import { todayIn } from "@/lib/dates";
import { withUser } from "@/lib/db";
import { buildCalendar } from "@/server/services/compliance/calendar";
import { getUserSettings } from "./settings";

export async function getCalendar(user: { id: string; createdAt: Date }) {
  const settings = await getUserSettings(user.id);
  const timezone = settings?.timezone ?? "Asia/Kolkata";
  const today = todayIn(timezone);
  const since = todayIn(timezone, user.createdAt);
  const items = await withUser(user.id, (tx) => buildCalendar(tx, { userId: user.id, today, since }));
  return { items, today };
}

export function getTask(userId: string, id: string) {
  return withUser(userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(complianceTasks)
      .where(and(eq(complianceTasks.id, id), eq(complianceTasks.userId, userId)));
    return row ?? null;
  });
}
