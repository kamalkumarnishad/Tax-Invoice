import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accounts, auditLogs, rateLimits, sessions, users, userSettings, verifications } from "@/db/schema";
import { type Auth, createAuth } from "@/lib/create-auth";
import { createTestDb, type TestDb } from "../helpers";

const baseURL = "http://localhost:3000";
const email = "asha@example.test";
const password = "correct horse battery";

let db: TestDb;
let close: () => Promise<void>;
let auth: Auth;
let outbox: { to: string; subject: string; text: string }[] = [];

function request(path: string, init: { body?: unknown; cookie?: string; ip?: string } = {}) {
  return auth.handler(
    new Request(path.startsWith("http") ? path : `${baseURL}/api/auth${path}`, {
      method: init.body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        origin: baseURL,
        "x-forwarded-for": init.ip ?? "203.0.113.1",
        ...(init.cookie ? { cookie: init.cookie } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    }),
  );
}

const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

const lastLink = () => outbox.at(-1)!.text.match(/https?:\/\/\S+/)![0];
const signUp = (extra: object = {}) => request("/sign-up/email", { body: { name: "Asha", email, password, ...extra } });
const signIn = (pass = password, ip?: string) => request("/sign-in/email", { body: { email, password: pass }, ip });
const sessionOf = async (cookie: string) => (await request("/get-session", { cookie })).json();

async function signUpVerified() {
  await signUp();
  return request(lastLink());
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  auth = createAuth({
    db,
    secret: "test-secret-that-is-at-least-32-characters",
    baseURL,
    sendEmail: async (message) => void outbox.push(message),
  });
});

afterAll(() => close());

beforeEach(async () => {
  outbox = [];
  for (const table of [auditLogs, rateLimits, verifications, sessions, accounts, users]) await db.delete(table);
});

describe("sign up", () => {
  it("creates an unverified user with settings and emails a link", async () => {
    expect((await signUp()).status).toBe(200);
    const [user] = await db.select().from(users);
    expect(user).toMatchObject({ email, emailVerified: false, role: "user", isActive: true });
    expect(await db.select().from(userSettings).where(eq(userSettings.userId, user!.id))).toHaveLength(1);
    expect(outbox).toHaveLength(1);
  });

  it("never stores the plain password", async () => {
    await signUp();
    const [account] = await db.select().from(accounts);
    expect(account!.password).toBeTruthy();
    expect(account!.password).not.toContain(password);
  });

  it("rejects passwords under 12 characters", async () => {
    expect((await signUp({ password: "short-one" })).status).toBe(400);
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("does not let anyone choose their own role", async () => {
    await signUp({ role: "super_admin" });
    const admins = await db.select().from(users).where(eq(users.role, "super_admin"));
    expect(admins).toHaveLength(0);
  });

  it("answers the same way for an email that is already registered", async () => {
    const first = await signUp();
    const second = await signUp();
    expect(second.status).toBe(first.status);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("allows 3 sign-ups an hour from one address", async () => {
    for (let i = 0; i < 3; i++) await signUp({ email: `user${i}@example.test` });
    expect((await signUp({ email: "user4@example.test" })).status).toBe(429);
  });
});

describe("email verification", () => {
  it("blocks sign in until the email is verified", async () => {
    await signUp();
    expect((await signIn()).status).toBe(403);
  });

  it("verifies and signs in through the emailed link", async () => {
    const response = await signUpVerified();
    expect((await sessionOf(cookieFrom(response))).user).toMatchObject({ email, emailVerified: true });
  });
});

describe("sign in", () => {
  it("sets an http-only, same-site session cookie and logs the login", async () => {
    await signUpVerified();
    const response = await signIn();
    expect(response.status).toBe(200);
    const cookie = response.headers.getSetCookie().find((c) => c.includes("session_token"))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, "user.login"));
    expect(logs.length).toBeGreaterThan(0);
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    await signUpVerified();
    const wrong = await signIn("not the password");
    const unknown = await request("/sign-in/email", { body: { email: "nobody@example.test", password } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json());
  });

  it("blocks the 6th attempt from one address, but not another address", async () => {
    await signUpVerified();
    for (let i = 0; i < 5; i++) expect((await signIn("not the password")).status).toBe(401);
    expect((await signIn()).status).toBe(429);
    expect((await signIn(password, "203.0.113.99")).status).toBe(200);
  });

  it("refuses a suspended user", async () => {
    await signUpVerified();
    await db.update(users).set({ isActive: false });
    expect((await signIn()).status).toBe(403);
  });
});

describe("password reset", () => {
  it("changes the password, works once, and ends existing sessions", async () => {
    const cookie = cookieFrom(await signUpVerified());
    await request("/request-password-reset", { body: { email, redirectTo: "/reset-password" } });
    const redirect = await request(lastLink());
    const token = new URL(redirect.headers.get("location")!, baseURL).searchParams.get("token");

    const next = "another long password";
    expect((await request("/reset-password", { body: { newPassword: next, token } })).status).toBe(200);
    expect(await sessionOf(cookie)).toBeNull();
    expect((await signIn()).status).toBe(401);
    expect((await signIn(next)).status).toBe(200);
    expect((await request("/reset-password", { body: { newPassword: password, token } })).status).toBe(400);
  });

  it("answers the same way for an unknown email and sends nothing", async () => {
    const response = await request("/request-password-reset", { body: { email: "nobody@example.test" } });
    expect(response.status).toBe(200);
    expect(outbox).toHaveLength(0);
  });
});

describe("sign out", () => {
  it("ends the session on the server", async () => {
    const cookie = cookieFrom(await signUpVerified());
    await request("/sign-out", { body: {}, cookie });
    expect(await sessionOf(cookie)).toBeNull();
  });
});
