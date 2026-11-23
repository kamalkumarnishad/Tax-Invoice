"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormError } from "@/components/forms/form-error";
import { registerWithValues } from "@/components/forms/register";
import { TextField } from "@/components/forms/text-field";
import { TextareaField } from "@/components/forms/textarea-field";
import { Button } from "@/components/ui/button";
import { saveBusinessAction } from "@/server/actions/invoices";
import { type BusinessInput, businessSchema } from "@/validations/invoices";

export function BusinessForm({ values }: { values: BusinessInput }) {
  const form = useForm<BusinessInput>({ resolver: zodResolver(businessSchema), defaultValues: values });
  const { errors, isSubmitting } = form.formState;
  const field = registerWithValues(form, values);

  const onSubmit = form.handleSubmit(async (input) => {
    const result = await saveBusinessAction(input);
    if (result.ok) toast.success("Business details saved");
    else form.setError("root", { message: result.error });
  });

  return (
    <form onSubmit={onSubmit} noValidate autoComplete="off" className="grid max-w-2xl gap-4">
      <FormError message={errors.root?.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="businessName"
          label="Your name or business name"
          error={errors.businessName?.message}
          {...field.text("businessName")}
        />
        <TextField id="business-email" label="Email" type="email" error={errors.email?.message} {...field.text("email")} />
        <TextField id="phone" label="Phone" error={errors.phone?.message} {...field.text("phone")} />
      </div>
      <TextareaField id="address" label="Address" error={errors.address?.message} {...field.text("address")} />
      <TextareaField
        id="paymentInstructions"
        label="How to pay you"
        error={errors.paymentInstructions?.message}
        {...field.text("paymentInstructions")}
      />
      <Button type="submit" disabled={isSubmitting} className="w-fit">
        Save business details
      </Button>
    </form>
  );
}
