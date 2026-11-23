"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { FormError } from "@/components/forms/form-error";
import { toOptions } from "@/components/forms/options";
import { registerWithValues } from "@/components/forms/register";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { TextareaField } from "@/components/forms/textarea-field";
import { Button } from "@/components/ui/button";
import { chargesGst, invoiceTotals, taxModes } from "@/lib/invoice";
import { createInvoiceAction, updateInvoiceAction } from "@/server/actions/invoices";
import {
  type InvoiceFormValues,
  type InvoiceInput,
  invoiceItemSchema,
  invoiceSchema,
  MAX_ITEMS,
} from "@/validations/invoices";
import { optionalAmount } from "@/validations/money";

type InvoiceFormProps = {
  id?: string;
  values: InvoiceFormValues;
  currencies: { value: string; label: string; decimals: number }[];
  clients: { value: string; label: string; currency: string | null }[];
};

const newItem = { description: "", quantity: "1", unitPrice: "" };

/** Lines that are not finished yet are left out, so a half-typed form still adds up. */
function preview(values: InvoiceFormValues, decimals: number) {
  const items = values.items.flatMap((item) => {
    const parsed = invoiceItemSchema.safeParse({ ...item, description: "x" });
    return parsed.success ? [parsed.data] : [];
  });
  const discount = optionalAmount.safeParse(values.discount);
  return invoiceTotals({
    items,
    discount: discount.success ? discount.data : "0",
    taxMode: values.taxMode,
    taxRate: /^\d{1,3}(\.\d{1,2})?$/.test(values.taxRate) ? values.taxRate : "0",
    decimals,
  });
}

export function InvoiceForm({ id, values, currencies, clients }: InvoiceFormProps) {
  const router = useRouter();
  const form = useForm<InvoiceFormValues, unknown, InvoiceInput>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: values,
  });
  const { errors, isSubmitting } = form.formState;
  const field = registerWithValues(form, values);
  const items = useFieldArray({ control: form.control, name: "items" });
  const current = { ...values, ...useWatch({ control: form.control }) } as InvoiceFormValues;
  const decimals = currencies.find((option) => option.value === current.currency)?.decimals ?? 2;
  const totals = preview(current, decimals);

  const onSubmit = form.handleSubmit(async (input) => {
    const result = id ? await updateInvoiceAction(id, input) : await createInvoiceAction(input);
    if (!result.ok) {
      form.setError("root", { message: result.error });
      return;
    }
    toast.success(id ? "Draft saved" : "Draft created");
    router.push(`/app/invoices/${id ?? result.data!.id}`);
  });

  const clientField = field.text("clientId");
  const lines = [
    { label: "Subtotal", amount: totals.subtotal },
    ...(Number(totals.discount) > 0 ? [{ label: "Discount", amount: `-${totals.discount}` }] : []),
    ...totals.taxes,
  ];

  return (
    <form onSubmit={onSubmit} noValidate autoComplete="off" className="grid max-w-4xl grid-cols-1 gap-8">
      <FormError message={errors.root?.message} />
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          id="clientId"
          label="Client"
          options={[{ value: "", label: "Choose a client" }, ...clients]}
          error={errors.clientId?.message}
          {...clientField}
          onChange={(event) => {
            void clientField.onChange(event);
            const usual = clients.find((client) => client.value === event.target.value)?.currency;
            if (usual && !id) form.setValue("currency", usual);
          }}
        />
        <TextField
          id="invoiceNumber"
          label="Invoice number"
          error={errors.invoiceNumber?.message}
          {...field.text("invoiceNumber")}
        />
        <SelectField
          id="currency"
          label="Currency"
          options={currencies}
          error={errors.currency?.message}
          {...field.text("currency")}
        />
        <TextField
          id="invoiceDate"
          label="Invoice date"
          type="date"
          error={errors.invoiceDate?.message}
          {...field.text("invoiceDate")}
        />
        <TextField
          id="dueDate"
          label="Due date"
          type="date"
          error={errors.dueDate?.message}
          {...field.text("dueDate")}
        />
      </div>

      <fieldset className="grid grid-cols-1 gap-4">
        <legend className="mb-3 font-medium">Items</legend>
        {items.fields.map((item, index) => {
          const itemErrors = errors.items?.[index];
          return (
            <div key={item.id} className="grid items-start gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_6rem_9rem_auto]">
              <TextField
                id={`items.${index}.description`}
                label="Description"
                error={itemErrors?.description?.message}
                defaultValue={item.description}
                {...form.register(`items.${index}.description`)}
              />
              <TextField
                id={`items.${index}.quantity`}
                label="Quantity"
                inputMode="decimal"
                error={itemErrors?.quantity?.message}
                defaultValue={item.quantity}
                {...form.register(`items.${index}.quantity`)}
              />
              <TextField
                id={`items.${index}.unitPrice`}
                label="Unit price"
                inputMode="decimal"
                error={itemErrors?.unitPrice?.message}
                defaultValue={item.unitPrice}
                {...form.register(`items.${index}.unitPrice`)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="sm:mt-5.5"
                aria-label={`Remove item ${index + 1}`}
                disabled={items.fields.length === 1}
                onClick={() => items.remove(index)}
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={items.fields.length >= MAX_ITEMS}
          onClick={() => items.append(newItem)}
        >
          <Plus /> Add item
        </Button>
      </fieldset>

      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField
          id="discount"
          label="Discount"
          inputMode="decimal"
          error={errors.discount?.message}
          {...field.text("discount")}
        />
        <SelectField id="taxMode" label="GST" options={toOptions(taxModes)} {...field.text("taxMode")} />
        {chargesGst(current.taxMode) && (
          <TextField
            id="taxRate"
            label="GST rate (%)"
            inputMode="decimal"
            hint="Check the rate for your service."
            error={errors.taxRate?.message}
            {...field.text("taxRate")}
          />
        )}
        {current.taxMode !== "none" && (
          <>
            <TextField
              id="sacCode"
              label="SAC code"
              hint="Such as 998314 for IT design and development."
              error={errors.sacCode?.message}
              {...field.text("sacCode")}
            />
            <TextField
              id="placeOfSupply"
              label="Place of supply"
              error={errors.placeOfSupply?.message}
              {...field.text("placeOfSupply")}
            />
          </>
        )}
      </div>
      <TextareaField id="notes" label="Notes and payment terms" error={errors.notes?.message} {...field.text("notes")} />

      <dl className="ml-auto grid w-full max-w-xs gap-2 text-sm" aria-live="polite">
        {lines.map((line) => (
          <div key={line.label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{line.label}</dt>
            <dd className="font-mono tabular-nums">{line.amount}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t pt-2 font-medium">
          <dt>Total</dt>
          <dd className="font-mono tabular-nums">
            {current.currency} {totals.total}
          </dd>
        </div>
      </dl>
      <Button type="submit" disabled={isSubmitting} className="w-fit">
        {id ? "Save draft" : "Create draft"}
      </Button>
    </form>
  );
}
