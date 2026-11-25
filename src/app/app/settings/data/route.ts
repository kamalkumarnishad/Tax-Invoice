import { after } from "next/server";
import { siteConfig } from "@/config/site";
import { getAuth, getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { download, isCrossSite, refuse } from "@/server/download";
import { prepareDownload } from "@/server/services/account/account";
import { toStream } from "@/server/services/account/export";

export const maxDuration = 60;

/** Asked for with JSON, which another site's form cannot send. */
async function passwordFrom(request: Request): Promise<string | null> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return null;
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("password" in body)) return null;
  return typeof body.password === "string" ? body.password : null;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return refuse("Sign in first.", 401);
  if (isCrossSite(request)) return refuse("Open this from Settings.", 403);
  const password = await passwordFrom(request);
  if (password === null) return refuse("Enter your password.", 400);

  const { user } = session;
  const now = new Date();
  const context = { db: await getDb(), auth: await getAuth(), headers: request.headers, now };
  const result = await prepareDownload(context, user, password);
  if (!result.ok) return refuse(result.error, 400);

  after(async () => {
    try {
      await sendEmail({
        to: user.email,
        subject: `Your ${siteConfig.name} data was downloaded`,
        text: `A copy of your data was downloaded just now.\n\nIf this was not you, change your password and sign out your other devices in Settings.`,
      });
    } catch (error) {
      console.error("Download notice not sent:", error instanceof Error ? error.message : "unknown error");
    }
  });
  return download(toStream(result.data), "application/zip", `taxpilot-data-${now.toISOString().slice(0, 10)}.zip`);
}
