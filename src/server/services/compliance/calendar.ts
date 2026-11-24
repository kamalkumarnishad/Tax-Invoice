import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { auditLogs, complianceMarks, complianceTasks, taxProfiles } from "@/db/schema";
import { daysBetween } from "@/lib/dates";
import { orNull } from "@/validations/common";
import type { MarkInput, TaskInput } from "@/validations/compliance";
import { type ActionResult, done, fail, type Tx } from "../shared";
import { reviewed } from "../tax-engine/rules";
import { type Deadline, deadlineRules, type DeadlineProfile, type GstFiling, statutoryDeadlines } from "./deadlines";

const DUE_SOON_DAYS = 7;

export type ItemState = "overdue" | "due_soon" | "upcoming" | "completed" | "not_applicable" | "earlier";

export type CalendarItem = {
  /** "task:<id>" for a user's own task, else the deadline's key. */
  key: string;
  taskId: string | null;
  title: string;
  dueDate: string;
  description: string | null;
  checklist: string[];
  state: ItemState;
  daysLeft: number;
};

const noProfile: DeadlineProfile = { presumptiveTaxation: false, hasLut: false, gstin: null, gstFiling: null };

async function deadlinesFor(tx: Tx, userId: string): Promise<Deadline[]> {
  if (!reviewed(deadlineRules.status)) return [];
  const [profile] = await tx
    .select({
      presumptiveTaxation: taxProfiles.presumptiveTaxation,
      hasLut: taxProfiles.hasLut,
      gstin: taxProfiles.gstin,
      gstFiling: taxProfiles.gstFiling,
    })
    .from(taxProfiles)
    .where(and(eq(taxProfiles.userId, userId), eq(taxProfiles.taxYearStart, deadlineRules.taxYearStart)));
  return statutoryDeadlines(profile ? { ...profile, gstFiling: profile.gstFiling as GstFiling | null } : noProfile);
}

type Options = { userId: string; today: string; since: string };

/**
 * Statutory deadlines and the user's own tasks, earliest first. Statutory ones
 * from before `since`, the day the user joined, are not called overdue: the app
 * cannot know what they did before then.
 */
export async function buildCalendar(tx: Tx, { userId, today, since }: Options): Promise<CalendarItem[]> {
  const deadlines = await deadlinesFor(tx, userId);
  const marks = await tx.select().from(complianceMarks).where(eq(complianceMarks.userId, userId));
  const tasks = await tx
    .select()
    .from(complianceTasks)
    .where(eq(complianceTasks.userId, userId))
    .orderBy(asc(complianceTasks.dueDate), asc(complianceTasks.createdAt));
  const marked = new Map(marks.map((mark) => [mark.deadlineKey, mark.status as ItemState]));

  const openState = (dueDate: string): ItemState => {
    if (dueDate < today) return "overdue";
    return daysBetween(today, dueDate) <= DUE_SOON_DAYS ? "due_soon" : "upcoming";
  };

  const items: CalendarItem[] = [
    ...deadlines.map((deadline) => ({
      ...deadline,
      taskId: null,
      state: marked.get(deadline.key) ?? (deadline.dueDate < since ? "earlier" : openState(deadline.dueDate)),
      daysLeft: daysBetween(today, deadline.dueDate),
    })),
    ...tasks.map((task) => ({
      key: `task:${task.id}`,
      taskId: task.id,
      title: task.title,
      dueDate: task.dueDate,
      description: task.description,
      checklist: [],
      state: task.completedAt ? ("completed" as const) : openState(task.dueDate),
      daysLeft: daysBetween(today, task.dueDate),
    })),
  ];
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export const isOpen = (item: CalendarItem) =>
  item.state === "overdue" || item.state === "due_soon" || item.state === "upcoming";

export async function markDeadline(tx: Tx, userId: string, { key, status }: MarkInput): Promise<ActionResult> {
  // Only a deadline that applies to this user, so made-up keys are never stored.
  const deadlines = await deadlinesFor(tx, userId);
  if (!deadlines.some((deadline) => deadline.key === key)) return fail("This deadline no longer applies to you.");

  if (status === "open") {
    await tx
      .delete(complianceMarks)
      .where(and(eq(complianceMarks.userId, userId), eq(complianceMarks.deadlineKey, key)));
  } else {
    await tx
      .insert(complianceMarks)
      .values({ userId, deadlineKey: key, status })
      .onConflictDoUpdate({
        target: [complianceMarks.userId, complianceMarks.deadlineKey],
        set: { status, markedAt: new Date() },
      });
  }
  await tx
    .insert(auditLogs)
    .values({ userId, action: "compliance.mark", resourceType: "deadline", details: { key, status } });
  return done;
}

const owned = (userId: string, id: string) => and(eq(complianceTasks.id, id), eq(complianceTasks.userId, userId));
const GONE = fail("This task no longer exists.");

const log = (tx: Tx, userId: string, action: string, resourceId: string) =>
  tx.insert(auditLogs).values({ userId, action, resourceType: "compliance_task", resourceId });

const toColumns = (input: TaskInput) => ({
  title: input.title,
  description: orNull(input.description),
  dueDate: input.dueDate,
});

export async function createTask(tx: Tx, userId: string, input: TaskInput): Promise<ActionResult> {
  const [row] = await tx
    .insert(complianceTasks)
    .values({ userId, ...toColumns(input) })
    .returning({ id: complianceTasks.id });
  await log(tx, userId, "compliance_task.create", row!.id);
  return done;
}

export async function updateTask(tx: Tx, userId: string, id: string, input: TaskInput): Promise<ActionResult> {
  const rows = await tx.update(complianceTasks).set(toColumns(input)).where(owned(userId, id)).returning();
  if (rows.length === 0) return GONE;
  await log(tx, userId, "compliance_task.update", id);
  return done;
}

export async function setTaskDone(tx: Tx, userId: string, id: string, isDone: boolean): Promise<ActionResult> {
  const rows = await tx
    .update(complianceTasks)
    .set({ completedAt: isDone ? new Date() : null })
    .where(owned(userId, id))
    .returning();
  if (rows.length === 0) return GONE;
  await log(tx, userId, isDone ? "compliance_task.complete" : "compliance_task.reopen", id);
  return done;
}

export async function deleteTask(tx: Tx, userId: string, id: string): Promise<ActionResult> {
  const rows = await tx.delete(complianceTasks).where(owned(userId, id)).returning();
  if (rows.length === 0) return GONE;
  await log(tx, userId, "compliance_task.delete", id);
  return done;
}
