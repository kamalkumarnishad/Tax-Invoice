import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layouts/page-header";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { TaxResults } from "@/components/tax/tax-results";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { deleteCalculationAction } from "@/server/actions/tax";
import { getUserSettings } from "@/server/queries/settings";
import { getCalculation } from "@/server/queries/tax";
import { calculatorAvailable } from "@/server/services/tax-engine/rules";
import { uuid } from "@/validations/common";

export const metadata: Metadata = { title: "Saved calculation" };

export default async function CalculationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = uuid.safeParse((await params).id);
  const calculation = id.success ? await getCalculation(user.id, id.data) : null;
  // The gate follows the rules the figures were worked out with.
  if (!calculation || !calculatorAvailable(calculation.rules)) notFound();
  const settings = await getUserSettings(user.id);
  const savedOn = formatDate(calculation.createdAt, "en-IN", settings?.timezone);

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title={calculation.rules.label}
        description={`Saved ${savedOn}, rules ${calculation.ruleId} version ${calculation.ruleVersion}`}
        action={
          <ConfirmDelete
            noun="calculation"
            name={`Saved ${savedOn}`}
            action={deleteCalculationAction.bind(null, calculation.id)}
            returnTo="/app/tax-calculator"
          />
        }
      />
      <TaxResults results={calculation.results} reviewed={calculation.rules.status === "approved"} />
    </div>
  );
}
