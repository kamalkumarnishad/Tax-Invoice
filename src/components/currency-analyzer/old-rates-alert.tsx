import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { daysBetween, formatCalendarDate } from "@/lib/dates";

/** Easter is the longest time without a new rate. */
const STALE_DAYS = 5;

export function OldRatesAlert({ updated, today }: { updated: string; today: string }) {
  if (daysBetween(updated, today) <= STALE_DAYS) return null;
  return (
    <Alert>
      <AlertTitle>These rates are old</AlertTitle>
      <AlertDescription>
        <p>New rates have not arrived since {formatCalendarDate(updated)}. The figures below use the saved ones.</p>
      </AlertDescription>
    </Alert>
  );
}
