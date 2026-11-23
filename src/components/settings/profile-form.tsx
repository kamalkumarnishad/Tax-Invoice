"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FormError } from "@/components/forms/form-error";
import { registerWithValues } from "@/components/forms/register";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { authClient, authErrorMessage } from "@/lib/auth-client";

const schema = z.object({ name: z.string().trim().min(1, "Enter your name").max(255) });

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { name } });
  const { errors, isSubmitting } = form.formState;
  const field = registerWithValues(form, { name });

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await authClient.updateUser(values);
    if (error) {
      form.setError("root", { message: authErrorMessage(error) });
      return;
    }
    toast.success("Profile saved");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-md gap-4">
      <FormError message={errors.root?.message} />
      <TextField id="name" label="Name" autoComplete="name" error={errors.name?.message} {...field.text("name")} />
      <TextField id="email" label="Email" type="email" value={email} readOnly disabled />
      <Button type="submit" disabled={isSubmitting} className="w-fit">
        Save profile
      </Button>
    </form>
  );
}
