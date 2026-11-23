import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { PageHeader } from "@/components/layouts/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { addDays } from "@/lib/dates";
import { listClientOptions } from "@/server/queries/clients";
import { suggestInvoiceNumber } from "@/server/queries/invoices";
import { getCurrencies, getUserDefaults } from "@/server/queries/settings";

export const metadata: Metadata = { title: "New invoice" };

const PAYMENT_DAYS = 30;

export default async function NewInvoicePage() {
  const user = await requireUser();
  const [defaults, currencies, clients] = await Promise.all([
    getUserDefaults(user.id),
    getCurrencies(user.id),
    listClientOptions(user.id),
  ]);

  if (clients.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageHeader title="New invoice" />
        <EmptyState
          icon={Users}
          title="Add a client first"
          description="An invoice needs someone to send it to."
          action={
            <Button asChild>
              <Link href="/app/clients/new">Add client</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader title="New invoice" />
      <Card>
        <CardContent>
          <InvoiceForm
            currencies={currencies}
            clients={clients}
            values={{
              clientId: "",
              invoiceNumber: await suggestInvoiceNumber(user.id, defaults.today),
              invoiceDate: defaults.today,
              dueDate: addDays(defaults.today, PAYMENT_DAYS),
              currency: defaults.currency,
              taxMode: "none",
              taxRate: "18",
              sacCode: "",
              placeOfSupply: "",
              discount: "",
              items: [{ description: "", quantity: "1", unitPrice: "" }],
              notes: "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
