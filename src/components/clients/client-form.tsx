"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormError } from "@/components/forms/form-error";
import { registerWithValues } from "@/components/forms/register";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { TextareaField } from "@/components/forms/textarea-field";
import { Button } from "@/components/ui/button";
import { createClientAction, updateClientAction } from "@/server/actions/clients";
import { type ClientInput, clientSchema } from "@/validations/clients";

type Option = { value: string; label: string };
type ClientFormProps = { id?: string; values: ClientInput; currencies: Option[]; countries: Option[] };

const none = { value: "", label: "Not set" };

export function ClientForm({ id, values, currencies, countries }: ClientFormProps) {
  const router = useRouter();
  const form = useForm<ClientInput>({ resolver: zodResolver(clientSchema), defaultValues: values });
  const { errors, isSubmitting } = form.formState;
  const field = registerWithValues(form, values);

  const onSubmit = form.handleSubmit(async (input) => {
    const result = id ? await updateClientAction(id, input) : await createClientAction(input);
    if (!result.ok) {
      form.setError("root", { message: result.error });
      return;
    }
    toast.success(id ? "Client saved" : "Client added");
    if (!id && result.data) router.push(`/app/clients/${result.data.id}`);
  });

  return (
    <form onSubmit={onSubmit} noValidate autoComplete="off" className="grid max-w-2xl gap-4">
      <FormError message={errors.root?.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="name" label="Name" error={errors.name?.message} {...field.text("name")} />
        <TextField id="company" label="Company" error={errors.company?.message} {...field.text("company")} />
        <TextField id="email" label="Email" type="email" error={errors.email?.message} {...field.text("email")} />
        <TextField id="taxId" label="Tax ID" error={errors.taxId?.message} {...field.text("taxId")} />
        <SelectField
          id="country"
          label="Country"
          options={[none, ...countries]}
          error={errors.country?.message}
          {...field.text("country")}
        />
        <SelectField
          id="currency"
          label="Usual currency"
          options={[none, ...currencies]}
          error={errors.currency?.message}
          {...field.text("currency")}
        />
      </div>
      <TextareaField
        id="billingAddress"
        label="Billing address"
        error={errors.billingAddress?.message}
        {...field.text("billingAddress")}
      />
      <TextareaField id="notes" label="Notes" error={errors.notes?.message} {...field.text("notes")} />
      <Button type="submit" disabled={isSubmitting} className="w-fit">
        {id ? "Save client" : "Add client"}
      </Button>
    </form>
  );
}
