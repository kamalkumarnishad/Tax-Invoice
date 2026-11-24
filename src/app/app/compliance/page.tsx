import { CalendarClock, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarEntry } from "@/components/compliance/calendar-item";
import { PageHeader } from "@/components/layouts/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatMonth } from "@/lib/dates";
import { getCalendar } from "@/server/queries/compliance";
import { getTaxProfile } from "@/server/queries/settings";
import { type CalendarItem, isOpen } from "@/server/services/compliance/calendar";
import { deadlineRules } from "@/server/services/compliance/deadlines";
import { reviewed } from "@/server/services/tax-engine/rules";

export const metadata: Metadata = { title: "Compliance" };

const views = [
  { value: "", label: "To do" },
  { value: "done", label: "Done" },
  { value: "all", label: "All" },
] as const;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function matches(item: CalendarItem, view: string): boolean {
  if (view === "all") return true;
  return view === "done" ? item.state === "completed" || item.state === "not_applicable" : isOpen(item);
}

export default async function CompliancePage({ searchParams }: Props) {
  const user = await requireUser();
  const { show } = await searchParams;
  const view = show === "done" || show === "all" ? show : "";
  const [{ items }, profile] = await Promise.all([getCalendar(user), getTaxProfile(user.id)]);
  const shown = items.filter((item) => matches(item, view));
  const overdue = shown.filter((item) => item.state === "overdue");
  const rest = shown.filter((item) => item.state !== "overdue");
  const groups = [
    ...(overdue.length > 0 ? [{ name: "Overdue", items: overdue }] : []),
    ...[...new Set(rest.map((item) => item.dueDate.slice(0, 7)))].map((month) => ({
      name: formatMonth(month, "long"),
      items: rest.filter((item) => item.dueDate.startsWith(month)),
    })),
  ];
  const statutory = reviewed(deadlineRules.status);

  return (
    <div className="grid max-w-4xl grid-cols-1 gap-6">
      <PageHeader
        title="Compliance"
        description="Tax dates for FY 2026-27 and your own tasks"
        action={
          <Button asChild>
            <Link href="/app/compliance/new">
              <Plus /> Add task
            </Link>
          </Button>
        }
      />
      <Alert>
        <AlertTitle>{statutory ? "Check dates before relying on them" : "Tax dates are being reviewed"}</AlertTitle>
        <AlertDescription>
          {statutory ? (
            <p>
              The government can extend a date, and weekends and holidays are not taken into account.
              {deadlineRules.status !== "approved" && " A chartered accountant has not checked these dates yet."}
            </p>
          ) : (
            <p>They will appear once a chartered accountant has checked them. You can add your own tasks now.</p>
          )}
        </AlertDescription>
      </Alert>
      {statutory && (!profile || (profile.gstin && !profile.gstFiling)) && (
        <p className="text-sm text-muted-foreground">
          {profile ? "Choose how often you file GST returns" : "Set up your tax profile"} in{" "}
          <Link href="/app/settings?tab=tax" className="text-foreground underline underline-offset-4">
            Settings
          </Link>{" "}
          to see every date that applies to you.
        </p>
      )}
      <nav aria-label="Show" className="flex gap-2">
        {views.map(({ value, label }) => (
          <Button key={label} asChild size="sm" variant={view === value ? "secondary" : "outline"}>
            <Link
              href={value ? `/app/compliance?show=${value}` : "/app/compliance"}
              aria-current={view === value ? "page" : undefined}
            >
              {label}
            </Link>
          </Button>
        ))}
      </nav>
      {groups.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={view === "done" ? "Nothing done yet" : "Nothing to do"}
          description="Add a task for anything you need to remember."
        />
      ) : (
        groups.map((group) => (
          <section key={group.name} className="grid grid-cols-1 gap-3">
            <h2 className="text-lg md:text-xl">{group.name}</h2>
            <ul className="divide-y rounded-lg border">
              {group.items.map((item) => (
                <CalendarEntry key={item.key} item={item} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
