import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { PageHeader } from "@/components/layouts/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { chargesGst, type TaxMode } from "@/lib/invoice";
import { isZero, plain } from "@/lib/money";
import { listClientOptions } from "@/server/queries/clients";
import { getInvoice } from "@/server/queries/invoices";
import { getCurrencies, getUserDefaults } from "@/server/queries/settings";
import { uuid } from "@/validations/common";

export const metadata: Metadata = { title: "Edit invoice" };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const { today } = await getUserDefaults(user.id);
  const detail = await getInvoice(user.id, id.data, today);
  if (!detail) notFound();
  const { invoice, items } = detail;
  if (invoice.status !== "draft") redirect(`/app/invoices/${invoice.id}`);
  const [currencies, clients] = await Promise.all([getCurrencies(user.id), listClientOptions(user.id)]);
  const taxMode = invoice.taxMode as TaxMode;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader title={`Edit ${invoice.invoiceNumber}`} />
      <Card>
        <CardContent>
          <InvoiceForm
            id={invoice.id}
            currencies={currencies}
            clients={clients}
            values={{
              clientId: invoice.clientId,
              invoiceNumber: invoice.invoiceNumber,
              invoiceDate: invoice.invoiceDate,
              dueDate: invoice.dueDate,
              currency: invoice.currency,
              taxMode,
              taxRate: chargesGst(taxMode) ? plain(invoice.taxRate) : "18",
              sacCode: invoice.sacCode ?? "",
              placeOfSupply: invoice.placeOfSupply ?? "",
              discount: isZero(invoice.discount) ? "" : plain(invoice.discount),
              items: items.map((item) => ({
                description: item.description,
                quantity: plain(item.quantity),
                unitPrice: plain(item.unitPrice),
              })),
              notes: invoice.notes ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
