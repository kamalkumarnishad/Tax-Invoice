"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, withUser } from "@/lib/db";
import { getUserDefaults } from "@/server/queries/settings";
import { isActiveCurrency } from "@/server/services/currency/currencies";
import { getRate, type Rate } from "@/server/services/currency/rates";
import { type ActionResult, fail, INVALID, ok } from "@/server/services/shared";
import { currencyCode } from "@/validations/common";
import { recordDate } from "@/validations/money";

const schema = z.object({ from: currencyCode, to: currencyCode, date: recordDate });

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

  const { today } = await getUserDefaults(user.id);
  const rate = await getRate(await getDb(), { from, to, date, today });
  return rate ? ok(rate) : fail("No rate found for that day. Enter the rate yourself.");
}
