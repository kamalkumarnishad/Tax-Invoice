import { Badge } from "@/components/ui/badge";
import { type InvoiceState, invoiceStates } from "@/lib/invoice";

export function StateBadge({ state }: { state: InvoiceState }) {
  const variant = state === "overdue" ? "destructive" : state === "paid" ? "secondary" : "outline";
  return <Badge variant={variant}>{invoiceStates[state]}</Badge>;
}
