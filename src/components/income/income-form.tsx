"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormError } from "@/components/forms/form-error";
import { RateField } from "@/components/forms/rate-field";
import { toOptions } from "@/components/forms/options";
import { registerWithValues } from "@/components/forms/register";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { TextareaField } from "@/components/forms/textarea-field";
import { Button } from "@/components/ui/button";
import { createIncomeAction, updateIncomeAction } from "@/server/actions/income";
import {
  incomeCategories,
  type IncomeFormValues,
  type IncomeInput,
  incomeSchema,
  incomeStatuses,
  paymentMethods,
} from "@/validations/income";

type IncomeFormProps = {
  id?: string;
  values: IncomeFormValues;
  baseCurrency: string;
  currencies: { value: string; label: string }[];
  clients: { value: string; label: string; currency: string | null }[];
};

export function IncomeForm({ id, values, baseCurrency, currencies, clients }: IncomeFormProps) {
  const router = useRouter();
  const form = useForm<IncomeFormValues, unknown, IncomeInput>({
    resolver: zodResolver(incomeSchema),
    defaultValues: values,
  });
  const { errors, isSubmitting } = form.formState;
  const field = registerWithValues(form, values);
  const [currency, date] = form.watch(["currency", "paymentDate"]);

  const onSubmit = form.handleSubmit(async (input) => {
    const result = id ? await updateIncomeAction(id, input) : await createIncomeAction(input);
    if (!result.ok) {
      form.setError("root", { message: result.error });
      return;
    }
    toast.success(id ? "Income saved" : "Income added");
    if (!id) router.push("/app/income");
  });

  const clientField = field.text("clientId");

  return (
    <form onSubmit={onSubmit} noValidate autoComplete="off" className="grid max-w-3xl gap-6">
      <FormError message={errors.root?.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="description"
          label="Description"
          error={errors.description?.message}
          {...field.text("description")}
        />
        <SelectField
          id="clientId"
          label="Client"
          options={[{ value: "", label: "No client" }, ...clients]}
          error={errors.clientId?.message}
          {...clientField}
          onChange={(event) => {
            void clientField.onChange(event);
            const usual = clients.find((client) => client.value === event.target.value)?.currency;
            if (usual && !id) form.setValue("currency", usual);
          }}
        />
        <TextField
          id="amount"
          label="Amount before fees"
          inputMode="decimal"
          error={errors.amount?.message}
          {...field.text("amount")}
        />
        <SelectField
          id="currency"
          label="Currency"
          options={currencies}
          error={errors.currency?.message}
          {...field.text("currency")}
        />
        <TextField
          id="paymentDate"
          label="Payment date"
          type="date"
          error={errors.paymentDate?.message}
          {...field.text("paymentDate")}
        />
        <SelectField id="status" label="Status" options={toOptions(incomeStatuses)} {...field.text("status")} />
        <SelectField
          id="paymentMethod"
          label="Payment method"
          options={toOptions(paymentMethods)}
          {...field.text("paymentMethod")}
        />
        <SelectField id="category" label="Category" options={toOptions(incomeCategories)} {...field.text("category")} />
        {currency !== baseCurrency && (
          <RateField
            from={currency}
            to={baseCurrency}
            date={date}
            error={errors.exchangeRate?.message}
            onRate={(rate) => form.setValue("exchangeRate", rate, { shouldValidate: true })}
            inputProps={field.text("exchangeRate")}
          />
        )}
      </div>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-3 text-sm font-medium">Deductions, if any</legend>
        <TextField
          id="gatewayFee"
          label={`Gateway fee (${currency})`}
          inputMode="decimal"
          error={errors.gatewayFee?.message}
          {...field.text("gatewayFee")}
        />
        <TextField
          id="bankCharges"
          label={`Bank charges (${baseCurrency})`}
          inputMode="decimal"
          error={errors.bankCharges?.message}
          {...field.text("bankCharges")}
        />
        <TextField
          id="tdsDeducted"
          label={`TDS deducted (${baseCurrency})`}
          inputMode="decimal"
          error={errors.tdsDeducted?.message}
          {...field.text("tdsDeducted")}
        />
      </fieldset>
      <TextareaField id="notes" label="Notes" error={errors.notes?.message} {...field.text("notes")} />
      <Button type="submit" disabled={isSubmitting} className="w-fit">
        {id ? "Save income" : "Add income"}
      </Button>
    </form>
  );
}
