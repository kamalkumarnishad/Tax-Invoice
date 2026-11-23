import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/invoices/confirm-action";
import { InvoicePreview } from "@/components/invoices/invoice-preview";
import { PaymentForm } from "@/components/invoices/payment-form";
import { StateBadge } from "@/components/invoices/state-badge";
import { PageHeader } from "@/components/layouts/page-header";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { CurrencyDisplay } from "@/components/shared/currency-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatCalendarDate } from "@/lib/dates";
import { chargesGst, type TaxMode } from "@/lib/invoice";
import { invoiceView } from "@/lib/invoice-view";
import { plain, subtract } from "@/lib/money";
import { cancelInvoiceAction, deleteInvoiceAction, issueInvoiceAction } from "@/server/actions/invoices";
import { getInvoice } from "@/server/queries/invoices";
import { getUserDefaults } from "@/server/queries/settings";
import { uuid } from "@/validations/common";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const { today, currency: baseCurrency } = await getUserDefaults(user.id);
  const detail = await getInvoice(user.id, id.data, today);
  if (!detail) notFound();
  const { invoice, payments, paid, state } = detail;

  return (
    <div className="grid max-w-4xl grid-cols-1 gap-6">
      <PageHeader
        title={invoice.invoiceNumber}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge state={state} />
            <Button asChild variant="outline">
              {/* Not a Link: prefetching would make a PDF nobody asked for. */}
              <a href={`/app/invoices/${invoice.id}/pdf`} download>
                <Download /> PDF
              </a>
            </Button>
            {invoice.status === "draft" && (
              <>
                <Button asChild variant="outline">
                  <Link href={`/app/invoices/${invoice.id}/edit`}>Edit</Link>
                </Button>
                <ConfirmDelete
                  noun="draft"
                  name={invoice.invoiceNumber}
                  action={deleteInvoiceAction.bind(null, invoice.id)}
                  returnTo="/app/invoices"
                />
                <ConfirmAction
                  label="Issue"
                  title="Issue this invoice?"
                  description="It can no longer be edited after this. Nothing is emailed: you send it to your client yourself."
                  done="Invoice issued"
                  action={issueInvoiceAction.bind(null, invoice.id)}
                />
              </>
            )}
            {invoice.status === "issued" && payments.length === 0 && (
              <ConfirmAction
                label="Cancel invoice"
                title="Cancel this invoice?"
                description="It stays in your records with its number, and cannot be reopened."
                done="Invoice cancelled"
                action={cancelInvoiceAction.bind(null, invoice.id)}
                destructive
              />
            )}
          </div>
        }
      />
      <InvoicePreview view={invoiceView(detail)} />
      {invoice.status === "issued" && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-base md:text-base">Payments</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4">
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">None recorded.</p>
            ) : (
              <ul className="divide-y text-sm">
                {payments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/app/income/${payment.id}`} className="underline-offset-4 hover:underline">
                      {formatCalendarDate(payment.paymentDate)}
                    </Link>
                    <CurrencyDisplay amount={payment.invoiceAmount ?? "0"} currency={invoice.currency} />
                  </li>
                ))}
              </ul>
            )}
            {state !== "paid" && (
              <PaymentForm
                key={paid}
                invoiceId={invoice.id}
                currency={invoice.currency}
                baseCurrency={baseCurrency}
                chargesGst={chargesGst(invoice.taxMode as TaxMode)}
                values={{
                  amount: plain(subtract(invoice.total, paid)),
                  paymentDate: today,
                  paymentMethod: "bank_transfer",
                  exchangeRate: "",
                  gatewayFee: "",
                  bankCharges: "",
                  tdsDeducted: "",
                  category: "freelance",
                }}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
