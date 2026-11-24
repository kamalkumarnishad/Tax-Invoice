import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { auditLogs, complianceTasks, reminderLog, users, userSettings } from "@/db/schema";
import { isCronRequest } from "@/lib/cron";
import { markDeadline } from "@/server/services/compliance/calendar";
import { sendReminders } from "@/server/services/compliance/reminders";
import { createTestDb, createUsers, type TestDb } from "../helpers";

let db: TestDb;
let close: () => Promise<void>;
let alice: string;
let bob: string;
let outbox: { to: string; subject: string; text: string }[] = [];

// 08:00 in India.
const at = (date: string) => new Date(`${date}T02:30:00Z`);
type Email = (typeof outbox)[number];
const deliver = async (email: Email): Promise<void> => void outbox.push(email);
const run = (date: string, sendEmail = deliver) =>
  sendReminders(db, { now: at(date), baseURL: "https://app.test", sendEmail });
const addTask = (userId: string, dueDate: string, title = "Call accountant") =>
  db.insert(complianceTasks).values({ userId, title, dueDate });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => close());
afterEach(() => vi.unstubAllEnvs());
beforeEach(async () => {
  outbox = [];
  await db.delete(auditLogs);
  await db.delete(users);
  [alice, bob] = await createUsers(db);
  await db.update(users).set({ emailVerified: true, createdAt: at("2026-11-01") });
  await db.insert(userSettings).values([{ userId: alice }, { userId: bob }]);
});

describe("reminders", () => {
  it.each([
    ["2026-12-07", 0],
    ["2026-12-08", 2],
    ["2026-12-14", 2],
    ["2026-12-15", 2],
    ["2026-12-16", 0],
  ])("for advance tax on 15 December, a first run on %s sends %i", async (date, count) => {
    expect(await run(date)).toEqual({ sent: count, failed: 0 });
    expect(outbox).toHaveLength(count);
  });

  it("go out 7, 3 and 1 days before when the job runs daily", async () => {
    const sentOn: string[] = [];
    for (let day = 5; day <= 17; day++) {
      const date = `2026-12-${String(day).padStart(2, "0")}`;
      if ((await run(date)).sent > 0) sentOn.push(date);
    }
    expect(sentOn).toEqual(["2026-12-08", "2026-12-12", "2026-12-14"]);
  });

  it("make up for a day the job missed", async () => {
    await run("2026-12-07");
    expect((await run("2026-12-09")).sent).toBe(2);
    expect((await run("2026-12-10")).sent).toBe(0);
  });

  it("are sent once, however often the job runs", async () => {
    await run("2026-12-08");
    await run("2026-12-08");
    await Promise.all([run("2026-12-08"), run("2026-12-08")]);
    expect(outbox).toHaveLength(2);
  });

  it("put everything due into one email", async () => {
    await addTask(alice, "2026-12-11");
    await run("2026-12-08");
    const email = outbox.find((message) => message.to === "alice@example.test")!;
    expect(email.subject).toBe("Reminder: 2 deadlines coming up");
    expect(email.text).toContain("Call accountant: 11 Dec 2026 (in 3 days)");
    expect(email.text).toContain("Advance tax: 75% in total: 15 Dec 2026 (in 7 days)");
    expect(email.text).toContain("https://app.test/app/settings");
  });

  it("never mix two people's tasks", async () => {
    await addTask(alice, "2026-12-01", "Alice only");
    await run("2026-11-30");
    expect(outbox.map((message) => [message.to, message.subject])).toEqual([
      ["alice@example.test", "Reminder: Alice only"],
    ]);
  });

  it("stop once a deadline is done or not for the user", async () => {
    const mark = { key: "IN-2026-27:advance-tax:2026-12-15", status: "completed" as const };
    await runAsUser(db, alice, (tx) => markDeadline(tx, alice, mark));
    await runAsUser(db, bob, (tx) => markDeadline(tx, bob, { ...mark, status: "not_applicable" }));
    expect(await run("2026-12-08")).toEqual({ sent: 0, failed: 0 });
  });

  it("start again when a task moves to a new date", async () => {
    await addTask(alice, "2026-12-01");
    await run("2026-11-30");
    await db.update(complianceTasks).set({ dueDate: "2026-12-02" });
    await run("2026-12-01");
    expect(outbox).toHaveLength(2);
  });

  it.each([
    ["turned them off", () => db.update(userSettings).set({ notificationsEnabled: false })],
    ["are suspended", () => db.update(users).set({ isActive: false })],
    ["have not verified their email", () => db.update(users).set({ emailVerified: false })],
  ])("skip people who %s", async (_, change) => {
    await change();
    expect(await run("2026-12-08")).toEqual({ sent: 0, failed: 0 });
  });

  it("use each person's own day", async () => {
    await db.update(userSettings).set({ timezone: "America/Los_Angeles" }).where(eq(userSettings.userId, bob));
    // Still 7 December in Los Angeles.
    await run("2026-12-08");
    expect(outbox.map((message) => message.to)).toEqual(["alice@example.test"]);
  });

  it("try again later when sending fails, without stopping the others", async () => {
    const failing = async (email: Email) => {
      if (email.to.startsWith("alice")) throw new Error("provider down");
      outbox.push(email);
    };
    expect(await run("2026-12-08", failing)).toEqual({ sent: 1, failed: 1 });
    expect(await db.select().from(reminderLog).where(eq(reminderLog.userId, alice))).toEqual([]);
    expect(await run("2026-12-08")).toEqual({ sent: 1, failed: 0 });
    expect(outbox.map((message) => message.to).sort()).toEqual(["alice@example.test", "bob@example.test"]);
  });

  it("cover only own tasks in production until the dates are reviewed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await addTask(alice, "2026-12-15");
    await run("2026-12-08");
    expect(outbox.map((message) => message.subject)).toEqual(["Reminder: Call accountant"]);
  });
});

describe("the cron secret", () => {
  const request = (authorization?: string) =>
    new Request("https://app.test", { headers: authorization ? { authorization } : {} });

  it.each([
    ["Bearer right", "right", true],
    ["Bearer wrong", "right", false],
    ["right", "right", false],
    [undefined, "right", false],
    ["Bearer undefined", undefined, false],
    ["Bearer ", "", false],
  ])("%s against %s: %s", (header, secret, allowed) => {
    expect(isCronRequest(request(header), secret)).toBe(allowed);
  });
});
