"use server";

import { requireUser } from "@/lib/auth";
import { formatCalendarDate } from "@/lib/dates";
import { withUser } from "@/lib/db";
import { getUserDefaults } from "@/server/queries/settings";
import { rateOn } from "@/server/services/currency-analyzer/history";
import { isActiveCurrency } from "@/server/services/currency/currencies";
import { type ActionResult, fail, INVALID, ok } from "@/server/services/shared";
import { FIRST_DAY, rateRequest } from "@/validations/currency-analyzer";

export type ReferenceRate = {
  rate: string;
  dateText: string;
  /** Whether the rate is from before the day asked for. */
  earlier: boolean;
};

/** Reads saved rates only, so it never waits for, or puts load on, an outside service. */
export async function getReferenceRateAction(input: unknown): Promise<ActionResult<ReferenceRate>> {
  const user = await requireUser();
  const parsed = rateRequest.safeParse(input);
  if (!parsed.success) {
    const badDate = parsed.error.issues.some((issue) => issue.path[0] === "date");
    return badDate ? fail("Enter a valid date.") : INVALID;
  }
  const { from, to, date } = parsed.data;
  const { today } = await getUserDefaults(user.id);
  if (date < FIRST_DAY) return fail("Rates start on 1 January 2016.");
  if (date > today) return fail("Choose a date that is not in the future.");

  return withUser(user.id, async (tx) => {
    if (!(await isActiveCurrency(tx, from)) || !(await isActiveCurrency(tx, to))) return INVALID;
    const point = await rateOn(tx, from, to, date);
    if (!point) return fail("There is no rate for that day.");
    return ok({ rate: point.rate, dateText: formatCalendarDate(point.date), earlier: point.date < date });
  });
}
