"use server";

import { z } from "zod";
import { todayIn } from "@/lib/dates";
import { requireUser } from "@/lib/auth";
import { getDb, withUser } from "@/lib/db";
import { getUserSettings } from "@/server/queries/settings";
import { isActiveCurrency } from "@/server/services/currency/currencies";
import { getRate, type Rate } from "@/server/services/currency/rates";
import { type ActionResult, fail, INVALID, ok } from "@/server/services/shared";
import { currencyCode } from "@/validations/common";

const schema = z.object({
  from: currencyCode,
  to: currencyCode,
  date: z.iso.date().refine((date) => date >= "2000-01-01"),
});

export async function getRateAction(input: unknown): Promise<ActionResult<Rate>> {
  const user = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return INVALID;
  const { from, to, date } = parsed.data;

  // Only known codes may reach the provider's address or the shared table.
  const known = await withUser(
    user.id,
    async (tx) => (await isActiveCurrency(tx, from)) && (await isActiveCurrency(tx, to)),
  );
  if (!known) return INVALID;

  const settings = await getUserSettings(user.id);
  const today = todayIn(settings?.timezone ?? "Asia/Kolkata");
  const rate = await getRate(await getDb(), { from, to, date, today });
  return rate ? ok(rate) : fail("No rate found for that day. Enter the rate yourself.");
}
