import { getSession } from "@/lib/auth";
import { invoiceView } from "@/lib/invoice-view";
import { download, isCrossSite, refuse } from "@/server/download";
import { renderInvoicePdf } from "@/server/pdf/invoice";
import { getInvoice } from "@/server/queries/invoices";
import { getUserDefaults } from "@/server/queries/settings";
import { uuid } from "@/validations/common";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return refuse("Sign in first.", 401);
  if (isCrossSite(request)) return refuse("Open this from the invoice page.", 403);

  const id = uuid.safeParse((await params).id);
  const { today } = await getUserDefaults(session.user.id);
  const detail = id.success ? await getInvoice(session.user.id, id.data, today) : null;
  // Another user's invoice and a missing one look the same.
  if (!detail) return refuse("No such invoice.", 404);

  const pdf = await renderInvoicePdf(invoiceView(detail));
  return download(new Uint8Array(pdf), "application/pdf", `${detail.invoice.invoiceNumber}.pdf`);
}
