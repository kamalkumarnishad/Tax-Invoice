import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layouts/page-header";
import { ConfirmDeletion } from "@/components/settings/confirm-deletion";
import { SettingsCard } from "@/components/settings/settings-card";
import { requireUser } from "@/lib/auth";

// The address holds the token, so it is not passed on to any other site.
export const metadata: Metadata = { title: "Delete account", referrer: "no-referrer" };

type Props = { searchParams: Promise<{ token?: string | string[] }> };

/** Where the emailed link leads. Opening it changes nothing. */
export default async function DeleteAccountPage({ searchParams }: Props) {
  const user = await requireUser();
  const { token } = await searchParams;

  return (
    <div className="grid max-w-2xl grid-cols-1 gap-6">
      <PageHeader title="Delete account" />
      {typeof token === "string" && token ? (
        <SettingsCard title="Delete this account permanently?" description={user.email}>
          <div className="grid gap-4">
            <p className="text-sm">
              Your records, invoices, tax profiles and settings will be deleted, and every device signed out. This cannot
              be undone.
            </p>
            <ConfirmDeletion token={token} />
          </div>
        </SettingsCard>
      ) : (
        <p className="text-sm text-muted-foreground">
          This link is not complete. Ask for a new one in{" "}
          <Link href="/app/settings?tab=data" className="text-foreground underline underline-offset-4">
            Settings
          </Link>
          .
        </p>
      )}
    </div>
  );
}
