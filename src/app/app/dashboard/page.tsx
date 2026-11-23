import { Calculator, CalendarClock, ChartColumn, TrendingUp, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/layouts/page-header";
import { CurrencyDisplay } from "@/components/shared/currency-display";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getTaxProfile, getUserSettings } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [settings, profile] = await Promise.all([getUserSettings(user.id), getTaxProfile(user.id)]);
  const currency = settings?.defaultCurrency ?? "INR";
  // Records arrive in Phase 2, so these are true zeros and not sample figures.
  const zero = <CurrencyDisplay amount="0" currency={currency} />;

  return (
    <div className="grid gap-6">
      <PageHeader title="Dashboard" description={`Welcome, ${user.name}.`} />
      {!profile && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium">Set up your tax profile</p>
              <p className="text-sm text-muted-foreground">
                Estimates need your tax year, regime and business structure.
              </p>
            </div>
            <Button asChild>
              <Link href="/app/settings?tab=tax">Set up</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Income" icon={TrendingUp} value={zero} note="No income recorded" />
        <StatCard title="Expenses" icon={Wallet} value={zero} note="No expenses recorded" />
        <StatCard
          title="Estimated tax"
          icon={Calculator}
          value={<span className="font-mono">—</span>}
          note="Available with the tax calculator"
        />
        <StatCard
          title="Next deadline"
          icon={CalendarClock}
          value={<span className="font-mono">—</span>}
          note="Available with the compliance calendar"
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Income and expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={ChartColumn}
            title="Nothing to chart yet"
            description="Your monthly income and expenses will appear here once you record them."
          />
        </CardContent>
      </Card>
    </div>
  );
}
