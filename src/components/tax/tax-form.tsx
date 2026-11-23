"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CheckboxField } from "@/components/forms/checkbox-field";
import { FormError } from "@/components/forms/form-error";
import { toOptions } from "@/components/forms/options";
import { registerWithValues } from "@/components/forms/register";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { TaxResults } from "@/components/tax/tax-results";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { calculateTaxAction, saveCalculationAction } from "@/server/actions/tax";
import { ageGroups, type Regime, type TaxResult } from "@/server/services/tax-engine/types";
import { type TaxFormInput, taxFormSchema, type TaxFormValues, taxMethods } from "@/validations/tax";

type AmountName = Exclude<
  keyof TaxFormValues,
  "ageGroup" | "method" | "professionConfirmed" | "parentsSenior" | "scopeConfirmed"
>;

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid grid-cols-1 gap-4">
      <legend className="mb-1 font-medium">{title}</legend>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      <div className="grid items-start gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function TaxForm({ values, reviewed }: { values: TaxFormValues; reviewed: boolean }) {
  const router = useRouter();
  const [calculated, setCalculated] = useState<{ input: TaxFormInput; results: Record<Regime, TaxResult> }>();
  const [saving, setSaving] = useState(false);
  const form = useForm<TaxFormValues, unknown, TaxFormInput>({
    resolver: zodResolver(taxFormSchema),
    defaultValues: values,
  });
  const { errors, isSubmitting } = form.formState;
  const field = registerWithValues(form, values);
  const presumptive = form.watch("method") === "presumptive";

  const amount = (name: AmountName, label: string, hint?: string) => (
    <TextField
      id={name}
      label={label}
      hint={hint}
      inputMode="decimal"
      error={errors[name]?.message}
      {...field.text(name)}
    />
  );

  const onSubmit = form.handleSubmit(async (input) => {
    const result = await calculateTaxAction(input);
    if (!result.ok) {
      setCalculated(undefined);
      form.setError("root", { message: result.error });
      return;
    }
    setCalculated({ input, results: result.data });
  });

  async function save() {
    if (!calculated) return;
    setSaving(true);
    const result = await saveCalculationAction(calculated.input);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Calculation saved");
    router.push(`/app/tax-calculator/${result.data.id}`);
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <Card>
        <CardContent>
          {/* Any edit hides the old result, so figures on screen always match the form. */}
          <form
            onSubmit={onSubmit}
            onChange={() => setCalculated(undefined)}
            noValidate
            autoComplete="off"
            className="grid max-w-3xl gap-8"
          >
            <FormError message={errors.root?.message} />
            <Section title="You">
              <SelectField
                id="ageGroup"
                label="Your age on 31 March 2027"
                options={toOptions(ageGroups)}
                {...field.text("ageGroup")}
              />
            </Section>
            <Section title="Professional income, in rupees">
              {amount("receipts", "Receipts before fees and TDS")}
              <SelectField id="method" label="How to work it out" options={toOptions(taxMethods)} {...field.text("method")} />
              {presumptive ? (
                <>
                  {amount("cashReceipts", "Of which received in cash", "Includes cheques that are not account-payee.")}
                  {amount("declaredProfit", "Actual profit, if above 50%", "Blank uses 50% of receipts.")}
                  <div className="sm:col-span-2">
                    <CheckboxField
                      id="professionConfirmed"
                      label="My profession is on the section 62(4) list"
                      hint="Legal, medical, engineering, architectural, accountancy, technical consultancy, interior decoration, information technology or company secretary. It is unclear whether software developers, designers, video editors, marketers and writers qualify, so ask a tax professional."
                      {...field.check("professionConfirmed")}
                    />
                  </div>
                </>
              ) : (
                amount("expenses", "Business expenses", "Includes gateway fees and bank charges.")
              )}
            </Section>
            <Section title="Other income, in rupees">
              {amount("salary", "Salary before the standard deduction")}
              {amount("savingsInterest", "Savings account interest")}
              {amount("otherInterest", "Other interest")}
            </Section>
            <Section
              title="Deductions"
              hint="Used in the old regime only. Limits are applied for you. Leave out NPS other than the extra ₹50,000."
            >
              {amount("savings", "PPF, ELSS, life insurance and similar", "Section 123, was 80C.")}
              {amount("nps", "Extra NPS", "Section 124, was 80CCD(1B).")}
              {amount("healthSelf", "Health insurance, you and family", "Section 126, was 80D.")}
              {amount("healthParents", "Health insurance, parents", "Section 126, was 80D.")}
              <CheckboxField
                id="parentsSenior"
                label="A parent is 60 or over"
                {...field.check("parentsSenior")}
              />
            </Section>
            <Section title="Already paid">{amount("taxDeducted", "Tax deducted at source (TDS)")}</Section>
            <div className="grid gap-2">
              <CheckboxField
                id="scopeConfirmed"
                label="This covers my situation"
                hint="I am an individual resident in India for FY 2026-27, with no capital gains, crypto, house property or farm income, and no losses."
                aria-invalid={Boolean(errors.scopeConfirmed)}
                {...field.check("scopeConfirmed")}
              />
              {errors.scopeConfirmed && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.scopeConfirmed.message}
                </p>
              )}
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-fit">
              {isSubmitting ? "Calculating…" : "Calculate"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <div aria-live="polite" className="grid grid-cols-1 gap-4">
        {calculated && (
          <>
            <TaxResults results={calculated.results} reviewed={reviewed} />
            <Button variant="outline" className="w-fit" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save this calculation"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
