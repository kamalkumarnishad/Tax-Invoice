import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/invoices/confirm-action";
import { InvoicePreview } from "@/components/invoices/invoice-preview";
import { StateBadge } from "@/components/invoices/state-badge";
import { PageHeader } from "@/components/layouts/page-header";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { invoiceView } from "@/lib/invoice-view";
import { cancelInvoiceAction, deleteInvoiceAction, issueInvoiceAction } from "@/server/actions/invoices";
import { getInvoice } from "@/server/queries/invoices";
import { getUserDefaults } from "@/server/queries/settings";
import { uuid } from "@/validations/common";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const { today } = await getUserDefaults(user.id);
  const detail = await getInvoice(user.id, id.data, today);
  if (!detail) notFound();
  const { invoice, payments, state } = detail;

  return (
    <div className="grid max-w-4xl grid-cols-1 gap-6">
      <PageHeader
        title={invoice.invoiceNumber}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge state={state} />
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
    </div>
  );
}
