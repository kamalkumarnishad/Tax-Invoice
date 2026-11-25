import "server-only";
import { getDb } from "@/lib/db";
import { refreshIfStale } from "./refresh";

/** For `after`: runs once the page has been sent, so a slow or failing source never holds it up. */
export async function refreshInBackground() {
  try {
    await refreshIfStale(await getDb(), { now: new Date() });
  } catch (error) {
    console.error("Refreshing reference rates failed:", error instanceof Error ? error.message : "unknown error");
  }
}
