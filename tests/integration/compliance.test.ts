import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { auditLogs, complianceMarks, complianceTasks, users } from "@/db/schema";
import { daysBetween } from "@/lib/dates";
import {
  buildCalendar,
  createTask,
  deleteTask,
  markDeadline,
  setTaskDone,
  updateTask,
} from "@/server/services/compliance/calendar";
import { deadlineRules, type DeadlineProfile, statutoryDeadlines } from "@/server/services/compliance/deadlines";
import { saveTaxProfile } from "@/server/services/settings";
import type { Tx } from "@/server/services/shared";
import { taskSchema } from "@/validations/compliance";
import { taxProfileSchema, type TaxProfileInput } from "@/validations/settings";
import { createTestDb, createUsers, type TestDb } from "../helpers";

const plainProfile: DeadlineProfile = { presumptiveTaxation: false, hasLut: false, gstin: null, gstFiling: null };
const dates = (profile: Partial<DeadlineProfile>, match: string) =>
  statutoryDeadlines({ ...plainProfile, ...profile })
    .filter((deadline) => deadline.key.includes(match))
    .map((deadline) => deadline.dueDate);

describe("statutory deadlines", () => {
  it("are advance tax and the return for someone without GST", () => {
    expect(statutoryDeadlines(plainProfile).map((deadline) => deadline.dueDate)).toEqual([
      "2026-06-15",
      "2026-09-15",
      "2026-12-15",
      "2027-03-15",
      "2027-08-31",
    ]);
  });

  it("have one advance tax date under the presumptive scheme", () => {
    expect(dates({ presumptiveTaxation: true }, "advance-tax")).toEqual(["2027-03-15"]);
  });

  it("include LUT renewal only with an LUT", () => {
    expect(dates({}, "lut")).toEqual([]);
    expect(dates({ hasLut: true }, "lut")).toEqual(["2027-03-31"]);
  });

  it("include monthly GST returns across the year end", () => {
    const monthly = { gstin: "27ABCDE1234F1Z5", gstFiling: "monthly" } as const;
    expect(dates(monthly, "gstr1")).toHaveLength(12);
    expect(dates(monthly, "gstr1")[0]).toBe("2026-05-11");
    expect(dates(monthly, "gstr3b").at(-1)).toBe("2027-04-20");
    expect(dates(monthly, "gstr1:2026-12")).toEqual(["2027-01-11"]);
    expect(dates(monthly, "pmt06")).toEqual([]);
  });

  it("include quarterly GST returns and the payments between them", () => {
    const quarterly = { gstin: "27ABCDE1234F1Z5", gstFiling: "quarterly" } as const;
    expect(dates(quarterly, "gstr1")).toEqual(["2026-07-13", "2026-10-13", "2027-01-13", "2027-04-13"]);
    expect(dates(quarterly, "gstr3b")).toEqual(["2026-07-22", "2026-10-22", "2027-01-22", "2027-04-22"]);
    expect(dates(quarterly, "pmt06")).toEqual([
      "2026-05-25",
      "2026-06-25",
      "2026-08-25",
      "2026-09-25",
      "2026-11-25",
      "2026-12-25",
      "2027-02-25",
      "2027-03-25",
    ]);
  });

  it("leave out GST until both the GSTIN and how often are known", () => {
    expect(dates({ gstin: "27ABCDE1234F1Z5" }, "gstr")).toEqual([]);
    expect(dates({ gstFiling: "monthly" }, "gstr")).toEqual([]);
  });

  it.each(["monthly", "quarterly"] as const)("have unique keys, real dates and fit their column, %s", (gstFiling) => {
    const all = statutoryDeadlines({ ...plainProfile, hasLut: true, gstin: "x", gstFiling });
    expect(new Set(all.map((deadline) => deadline.key)).size).toBe(all.length);
    for (const { key, dueDate } of all) {
      expect(key.length).toBeLessThanOrEqual(100);
      expect(new Date(`${dueDate}T00:00:00Z`).toISOString().slice(0, 10)).toBe(dueDate);
    }
  });

  it("stay marked as pending until an accountant has reviewed them", () => {
    // Change this test in the same commit that records the review.
    expect(deadlineRules.status).toBe("pending_review");
  });
});

let db: TestDb;
let close: () => Promise<void>;
let alice: string;
let bob: string;

const today = "2026-12-10";
const ADVANCE = "IN-2026-27:advance-tax:2026-12-15";
const as = <T>(userId: string, work: (tx: Tx) => Promise<T>) => runAsUser(db, userId, work);
const calendar = (change: Partial<{ userId: string; today: string; since: string }> = {}) => {
  const options = { userId: alice, today, since: "2026-11-01", ...change };
  return as(options.userId, (tx) => buildCalendar(tx, options));
};
const state = async (key: string, change = {}) => (await calendar(change)).find((item) => item.key === key)?.state;
const task = { title: "Call accountant", description: "", dueDate: "2026-12-12" };
const add = (userId = alice, change = {}) => as(userId, (tx) => createTask(tx, userId, { ...task, ...change }));
const taskId = async () => (await db.select().from(complianceTasks))[0]!.id;

const profile: TaxProfileInput = {
  taxYearStart: "2026-04-01",
  ageGroup: "under_60",
  regime: "new_regime",
  businessStructure: "freelancer",
  presumptiveTaxation: false,
  pan: "",
  removePan: false,
  gstin: "27ABCDE1234F1Z5",
  gstFiling: "monthly",
  hasLut: false,
  lutArn: "",
  lutValidFrom: "",
  lutValidTo: "",
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await db.delete(auditLogs);
  await db.delete(users);
  [alice, bob] = await createUsers(db);
});

describe("calendar", () => {
  it("works out each state from today and when the user joined", async () => {
    expect(await state("IN-2026-27:advance-tax:2026-06-15")).toBe("earlier");
    expect(await state(ADVANCE)).toBe("due_soon");
    expect(await state(ADVANCE, { today: "2026-12-07" })).toBe("upcoming");
    expect(await state(ADVANCE, { today: "2026-12-15" })).toBe("due_soon");
    expect(await state(ADVANCE, { today: "2026-12-16" })).toBe("overdue");
    expect(await state(ADVANCE, { today: "2026-12-16", since: "2026-12-16" })).toBe("earlier");
  });

  it("follows the tax profile", async () => {
    expect(await state("IN-2026-27:gstr1:2026-11")).toBeUndefined();
    await as(alice, (tx) => saveTaxProfile(tx, alice, profile));
    expect(await state("IN-2026-27:gstr1:2026-11")).toBe("due_soon");
  });

  it("merges own tasks in date order", async () => {
    await add();
    const open = (await calendar()).filter((item) => item.state !== "earlier");
    expect(open.slice(0, 2).map((item) => item.title)).toEqual(["Call accountant", "Advance tax: 75% in total"]);
    expect(open[0]).toMatchObject({ state: "due_soon", daysLeft: 2 });
  });

  it("calls a user's own late task overdue whenever it was due", async () => {
    await add(alice, { dueDate: "2026-01-01" });
    expect((await calendar())[0]).toMatchObject({ title: "Call accountant", state: "overdue" });
  });
});

describe("marking a deadline", () => {
  const mark = (status: "completed" | "not_applicable" | "open", key = ADVANCE, userId = alice) =>
    as(userId, (tx) => markDeadline(tx, userId, { key, status }));

  it("can be done, changed and undone", async () => {
    await mark("completed");
    expect(await state(ADVANCE)).toBe("completed");
    await mark("not_applicable");
    expect(await state(ADVANCE)).toBe("not_applicable");
    await mark("open");
    expect(await state(ADVANCE)).toBe("due_soon");
    expect(await db.select().from(auditLogs)).toHaveLength(3);
  });

  it("refuses a key that is not one of the user's deadlines", async () => {
    expect((await mark("completed", "made-up")).ok).toBe(false);
    expect((await mark("completed", "IN-2026-27:gstr1:2026-11")).ok).toBe(false);
    expect(await db.select().from(complianceMarks)).toEqual([]);
  });

  it("affects only that user", async () => {
    await mark("completed");
    expect(await state(ADVANCE, { userId: bob })).toBe("due_soon");
    expect(await as(bob, (tx) => tx.select().from(complianceMarks))).toEqual([]);
  });
});

describe("own tasks", () => {
  it("can be edited, completed, reopened and deleted", async () => {
    await add();
    const id = await taskId();
    await as(alice, (tx) => updateTask(tx, alice, id, { ...task, title: "Email accountant" }));
    await as(alice, (tx) => setTaskDone(tx, alice, id, true));
    expect((await calendar()).find((item) => item.taskId === id)).toMatchObject({
      title: "Email accountant",
      state: "completed",
    });
    await as(alice, (tx) => setTaskDone(tx, alice, id, false));
    expect((await calendar()).find((item) => item.taskId === id)!.state).toBe("due_soon");
    await as(alice, (tx) => deleteTask(tx, alice, id));
    expect(await db.select().from(complianceTasks)).toEqual([]);
  });

  it("are private", async () => {
    await add(bob);
    const id = await taskId();
    const results = await as(alice, async (tx) => [
      await updateTask(tx, alice, id, { ...task, title: "Stolen" }),
      await setTaskDone(tx, alice, id, true),
      await deleteTask(tx, alice, id),
    ]);
    expect(results.every((result) => !result.ok)).toBe(true);
    expect((await calendar()).some((item) => item.taskId === id)).toBe(false);
    expect(await db.select().from(complianceTasks).where(eq(complianceTasks.userId, bob))).toMatchObject([
      { title: "Call accountant", completedAt: null },
    ]);
  });

  it.each([
    [{ title: " " }, "title"],
    [{ dueDate: "soon" }, "dueDate"],
    [{ description: "x".repeat(1001) }, "description"],
  ])("reject %j", (change, field) => {
    expect(taskSchema.safeParse({ ...task, ...change }).error?.issues[0]?.path).toEqual([field]);
  });
});

describe("the review gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("leaves only own tasks in production until the dates are reviewed", async () => {
    await add();
    vi.stubEnv("NODE_ENV", "production");
    expect((await calendar()).map((item) => item.title)).toEqual(["Call accountant"]);
    const result = await as(alice, (tx) => markDeadline(tx, alice, { key: ADVANCE, status: "completed" }));
    expect(result.ok).toBe(false);
  });
});

describe("tax profile", () => {
  it("needs a filing frequency only with a GSTIN, and drops it without one", async () => {
    const missing = taxProfileSchema.safeParse({ ...profile, gstFiling: "" });
    expect(missing.error?.issues[0]?.path).toEqual(["gstFiling"]);
    expect(taxProfileSchema.safeParse({ ...profile, gstin: "", gstFiling: "" }).success).toBe(true);
  });
});

it("counts days across months, years and leap days", () => {
  expect(daysBetween("2026-12-10", "2026-12-15")).toBe(5);
  expect(daysBetween("2026-12-15", "2026-12-10")).toBe(-5);
  expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
});
