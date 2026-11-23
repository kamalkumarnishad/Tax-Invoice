"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CheckboxField } from "@/components/forms/checkbox-field";
import { FormError } from "@/components/forms/form-error";
import { toOptions } from "@/components/forms/options";
import { RateField } from "@/components/forms/rate-field";
import { registerWithValues } from "@/components/forms/register";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { TextareaField } from "@/components/forms/textarea-field";
import { Button } from "@/components/ui/button";
import { createExpenseAction, updateExpenseAction } from "@/server/actions/expenses";
import { expenseCategories, type ExpenseFormValues, type ExpenseInput, expenseSchema } from "@/validations/expenses";
import { paymentMethods } from "@/validations/income";

type ExpenseFormProps = {
  id?: string;
  values: ExpenseFormValues;
  baseCurrency: string;
  currencies: { value: string; label: string }[];
};

export function ExpenseForm({ id, values, baseCurrency, currencies }: ExpenseFormProps) {
  const router = useRouter();
  const form = useForm<ExpenseFormValues, unknown, ExpenseInput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: values,
  });
  const { errors, isSubmitting } = form.formState;
  const field = registerWithValues(form, values);
  const [currency, date] = form.watch(["currency", "expenseDate"]);

  const onSubmit = form.handleSubmit(async (input) => {
    const result = id ? await updateExpenseAction(id, input) : await createExpenseAction(input);
    if (!result.ok) {
      form.setError("root", { message: result.error });
      return;
    }
    toast.success(id ? "Expense saved" : "Expense added");
    if (!id) router.push("/app/expenses");
  });

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
        <TextField id="vendor" label="Vendor" error={errors.vendor?.message} {...field.text("vendor")} />
        <TextField
          id="amount"
          label="Amount"
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
          id="expenseDate"
          label="Date"
          type="date"
          error={errors.expenseDate?.message}
          {...field.text("expenseDate")}
        />
        <SelectField
          id="category"
          label="Category"
          options={toOptions(expenseCategories)}
          {...field.text("category")}
        />
        <SelectField
          id="paymentMethod"
          label="Payment method"
          options={toOptions(paymentMethods)}
          {...field.text("paymentMethod")}
        />
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
      <CheckboxField
        id="isDeductible"
        label="Business expense"
        hint="Marks it as one to consider for deduction. Check with a tax professional what is allowed."
        {...field.check("isDeductible")}
      />
      <TextareaField id="notes" label="Notes" error={errors.notes?.message} {...field.text("notes")} />
      <Button type="submit" disabled={isSubmitting} className="w-fit">
        {id ? "Save expense" : "Add expense"}
      </Button>
    </form>
  );
}
