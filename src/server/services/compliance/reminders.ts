import "server-only";
import { and, eq } from "drizzle-orm";
import { siteConfig } from "@/config/site";
import { reminderLog, users, userSettings } from "@/db/schema";
import { runAsUser } from "@/db/run-as-user";
import { relativeDays } from "@/lib/compliance";
import { formatCalendarDate, todayIn } from "@/lib/dates";
import type { Tx } from "../shared";
import { buildCalendar, type CalendarItem, isOpen } from "./calendar";

/** Smallest first. */
const REMIND_DAYS_BEFORE = [1, 3, 7];

/**
 * The reminder an item has reached: 5 days left is still the 7-day one, so a
 * day the job missed is made up on the next. Undefined when none is due.
 */
const reminderFor = (item: CalendarItem) =>
  item.daysLeft < 0 ? undefined : REMIND_DAYS_BEFORE.find((days) => item.daysLeft <= days);

type Email = { to: string; subject: string; text: string };
type Options = { now: Date; baseURL: string; sendEmail: (email: Email) => Promise<void> };
type Recipient = { id: string; email: string; createdAt: Date; timezone: string };

function compose(to: string, items: CalendarItem[], baseURL: string): Email {
  const lines = items.map(
    (item) => `- ${item.title}: ${formatCalendarDate(item.dueDate)} (${relativeDays(item.daysLeft).toLowerCase()})`,
  );
  return {
    to,
    subject: items.length === 1 ? `Reminder: ${items[0]!.title}` : `Reminder: ${items.length} deadlines coming up`,
    text: [
      "Coming up:",
      "",
      ...lines,
      "",
      `See them in your calendar: ${baseURL}/app/compliance`,
      "",
      "Dates can be extended, so check them with the government portal or your accountant.",
      `To stop these emails, turn off email reminders in your ${siteConfig.name} settings: ${baseURL}/app/settings`,
    ].join("\n"),
  };
}

/** True when an email was sent. */
async function remind(db: Tx, user: Recipient, { now, baseURL, sendEmail }: Options): Promise<boolean> {
  const today = todayIn(user.timezone, now);
  const since = todayIn(user.timezone, user.createdAt);
  return runAsUser(db, user.id, async (tx) => {
    const calendar = await buildCalendar(tx, { userId: user.id, today, since });
    const due = calendar.filter(isOpen).flatMap((item) => {
      const daysBefore = reminderFor(item);
      return daysBefore === undefined ? [] : [{ item, daysBefore }];
    });
    if (due.length === 0) return false;

    // Claimed before sending, so a second run at the same time finds nothing to claim.
    const claimed = await tx
      .insert(reminderLog)
      .values(
        due.map(({ item, daysBefore }) => ({
          userId: user.id,
          itemKey: item.key,
          dueDate: item.dueDate,
          daysBefore,
        })),
      )
      .onConflictDoNothing()
      .returning({ itemKey: reminderLog.itemKey });
    const fresh = due.map(({ item }) => item).filter((item) => claimed.some((row) => row.itemKey === item.key));
    if (fresh.length === 0) return false;

    // A failure here undoes the claim, so the next run tries again.
    await sendEmail(compose(user.email, fresh, baseURL));
    return true;
  });
}

/** `db` must be the full-access connection: it looks across all users. */
export async function sendReminders(db: Tx, options: Options): Promise<{ sent: number; failed: number }> {
  const recipients = await db
    .select({ id: users.id, email: users.email, createdAt: users.createdAt, timezone: userSettings.timezone })
    .from(users)
    .innerJoin(userSettings, eq(userSettings.userId, users.id))
    .where(
      and(eq(users.isActive, true), eq(users.emailVerified, true), eq(userSettings.notificationsEnabled, true)),
    );

  let sent = 0;
  let failed = 0;
  for (const user of recipients) {
    try {
      if (await remind(db, user, options)) sent++;
    } catch (error) {
      // One person's failure must not stop the rest. No address is logged.
      failed++;
      console.error("Reminder failed for user", user.id, error instanceof Error ? error.message : "unknown error");
    }
  }
  return { sent, failed };
}
