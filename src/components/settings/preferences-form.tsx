"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CheckboxField } from "@/components/forms/checkbox-field";
import { FormError } from "@/components/forms/form-error";
import { registerWithValues } from "@/components/forms/register";
import { SelectField } from "@/components/forms/select-field";
import { Button } from "@/components/ui/button";
import { savePreferencesAction } from "@/server/actions/settings";
import { type PreferencesInput, preferencesSchema } from "@/validations/settings";

type Option = { value: string; label: string };
type PreferencesFormProps = { values: PreferencesInput; currencies: Option[]; timezones: Option[] };

export function PreferencesForm({ values, currencies, timezones }: PreferencesFormProps) {
  const form = useForm<PreferencesInput>({ resolver: zodResolver(preferencesSchema), defaultValues: values });
  const { errors, isSubmitting } = form.formState;
  const field = registerWithValues(form, values);

  const onSubmit = form.handleSubmit(async (input) => {
    const result = await savePreferencesAction(input);
    if (result.ok) toast.success("Preferences saved");
    else form.setError("root", { message: result.error });
  });

  return (
    <form onSubmit={onSubmit} noValidate autoComplete="off" className="grid max-w-md gap-4">
      <FormError message={errors.root?.message} />
      <SelectField
        id="defaultCurrency"
        label="Default currency"
        options={currencies}
        error={errors.defaultCurrency?.message}
        {...field.text("defaultCurrency")}
      />
      <SelectField
        id="timezone"
        label="Time zone"
        options={timezones}
        error={errors.timezone?.message}
        {...field.text("timezone")}
      />
      <CheckboxField
        id="notificationsEnabled"
        label="Email reminders"
        hint="For your compliance dates and tasks, 7, 3 and 1 days before."
        {...field.check("notificationsEnabled")}
      />
      <Button type="submit" disabled={isSubmitting} className="w-fit">
        Save preferences
      </Button>
    </form>
  );
}
