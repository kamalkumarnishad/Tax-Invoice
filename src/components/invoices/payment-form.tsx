"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormError } from "@/components/forms/form-error";
import { toOptions } from "@/components/forms/options";
import { RateField } from "@/components/forms/rate-field";
import { registerWithValues } from "@/components/forms/register";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { recordPaymentAction } from "@/server/actions/invoices";
import { incomeCategories, paymentMethods } from "@/validations/income";
import { type PaymentFormValues, type PaymentInput, paymentSchema } from "@/validations/invoices";

type PaymentFormProps = {
  invoiceId: string;
  currency: string;
  baseCurrency: string;
  chargesGst: boolean;
  values: PaymentFormValues;
};

export function PaymentForm({ invoiceId, currency, baseCurrency, chargesGst, values }: PaymentFormProps) {
  const [open, setOpen] = useState(false);
  const form = useForm<PaymentFormValues, unknown, PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: values,
  });
  const { errors, isSubmitting } = form.formState;
  const field = registerWithValues(form, values);
  const date = form.watch("paymentDate");

  const onSubmit = form.handleSubmit(async (input) => {
    const result = await recordPaymentAction(invoiceId, input);
    if (!result.ok) {
      form.setError("root", { message: result.error });
      return;
    }
    toast.success("Payment recorded and added to your income");
    setOpen(false);
  });

  if (!open) {
    return (
      <Button className="w-fit" onClick={() => setOpen(true)}>
        Record a payment
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate autoComplete="off" className="grid grid-cols-1 gap-4">
      <FormError message={errors.root?.message} />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <TextField
          id="amount"
          label={`Amount settled (${currency})`}
          inputMode="decimal"
          hint="Including any TDS and fees taken out of it."
          error={errors.amount?.message}
          {...field.text("amount")}
        />
        <TextField
          id="paymentDate"
          label="Payment date"
          type="date"
          error={errors.paymentDate?.message}
          {...field.text("paymentDate")}
        />
        <SelectField
          id="paymentMethod"
          label="Payment method"
          options={toOptions(paymentMethods)}
          {...field.text("paymentMethod")}
        />
        <SelectField
          id="category"
          label="Income category"
          options={toOptions(incomeCategories)}
          {...field.text("category")}
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
      </div>
      {chargesGst && (
        <p className="text-sm text-muted-foreground">
          GST you collect is not income, so only the rest of the payment is added to your income.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Record payment"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </form>
  );
}
