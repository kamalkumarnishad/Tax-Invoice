import { date, index, integer, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { timestamps } from "./columns";

/** What a user has said about a statutory deadline. The deadlines themselves are in code. */
export const complianceMarks = pgTable(
  "compliance_marks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deadlineKey: varchar("deadline_key", { length: 100 }).notNull(),
    /** completed or not_applicable */
    status: varchar("status", { length: 20 }).notNull(),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("compliance_marks_user_key").on(t.userId, t.deadlineKey)],
);

/** Tasks the user adds. */
export const complianceTasks = pgTable(
  "compliance_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    dueDate: date("due_date").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("idx_compliance_tasks_user_due").on(t.userId, t.dueDate)],
);

/** One row per reminder sent, so none is sent twice. A moved due date counts as new. */
export const reminderLog = pgTable(
  "reminder_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemKey: varchar("item_key", { length: 100 }).notNull(),
    dueDate: date("due_date").notNull(),
    daysBefore: integer("days_before").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("reminder_log_once").on(t.userId, t.itemKey, t.dueDate, t.daysBefore)],
);
