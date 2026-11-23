"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CheckboxField } from "@/components/forms/checkbox-field";
import { FormError } from "@/components/forms/form-error";
import { toOptions } from "@/components/forms/options";
import { registerWithValues } from "@/components/forms/register";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { saveTaxProfileAction } from "@/server/actions/settings";
import {
  businessStructures,
  regimes,
  taxpayerTypes,
  type TaxProfileInput,
  taxProfileSchema,
  taxYears,
} from "@/validations/settings";

type TaxProfileFormProps = { values: TaxProfileInput; panLast4: string | null };

export function TaxProfileForm({ values, panLast4 }: TaxProfileFormProps) {
  const form = useForm<TaxProfileInput>({ resolver: zodResolver(taxProfileSchema), defaultValues: values });
  const { errors, isSubmitting } = form.formState;
  const field = registerWithValues(form, values);
  const hasLut = form.watch("hasLut");

  const onSubmit = form.handleSubmit(async (input) => {
    const result = await saveTaxProfileAction(input);
    if (!result.ok) {
      form.setError("root", { message: result.error });
      return;
    }
    toast.success("Tax profile saved");
    // The PAN is never sent back, so clear it from the form too.
    form.reset({ ...input, pan: "", removePan: false });
  });

  return (
    <form onSubmit={onSubmit} noValidate autoComplete="off" className="grid max-w-2xl gap-6">
      <FormError message={errors.root?.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="country" label="Country" value="India" readOnly disabled />
        <SelectField id="taxYearStart" label="Tax year" options={taxYears} {...field.text("taxYearStart")} />
        <SelectField
          id="taxpayerType"
          label="Taxpayer type"
          options={toOptions(taxpayerTypes)}
          {...field.text("taxpayerType")}
        />
        <SelectField
          id="businessStructure"
          label="Business structure"
          options={toOptions(businessStructures)}
          {...field.text("businessStructure")}
        />
        <SelectField id="regime" label="Regime" options={toOptions(regimes)} {...field.text("regime")} />
      </div>
      <CheckboxField
        id="presumptiveTaxation"
        label="I use presumptive taxation"
        hint="Check with a tax professional that you are eligible."
        {...field.check("presumptiveTaxation")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-3">
          <TextField
            id="pan"
            label="PAN"
            autoComplete="off"
            placeholder={panLast4 ? `••••••${panLast4}` : "ABCDE1234F"}
            hint={panLast4 ? "Leave blank to keep the saved PAN. Stored encrypted." : "Optional. Stored encrypted."}
            error={errors.pan?.message}
            {...field.text("pan")}
          />
          {panLast4 && <CheckboxField id="removePan" label="Remove saved PAN" {...field.check("removePan")} />}
        </div>
        <TextField
          id="gstin"
          label="GSTIN"
          autoComplete="off"
          hint="Optional. Only if you are registered for GST."
          error={errors.gstin?.message}
          {...field.text("gstin")}
        />
      </div>
      <CheckboxField
        id="hasLut"
        label="I have a Letter of Undertaking (LUT)"
        hint="For exporting services without paying IGST."
        {...field.check("hasLut")}
      />
      {hasLut && (
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            id="lutArn"
            label="LUT reference (ARN)"
            error={errors.lutArn?.message}
            {...field.text("lutArn")}
          />
          <TextField
            id="lutValidFrom"
            label="Valid from"
            type="date"
            error={errors.lutValidFrom?.message}
            {...field.text("lutValidFrom")}
          />
          <TextField
            id="lutValidTo"
            label="Valid to"
            type="date"
            error={errors.lutValidTo?.message}
            {...field.text("lutValidTo")}
          />
        </div>
      )}
      <Button type="submit" disabled={isSubmitting} className="w-fit">
        Save tax profile
      </Button>
    </form>
  );
}
