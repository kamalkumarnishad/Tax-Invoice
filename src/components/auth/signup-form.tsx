"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { FormError } from "@/components/forms/form-error";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { PASSWORD_MIN_LENGTH, signupSchema } from "@/validations/auth";

export function SignupForm() {
  const [sentTo, setSentTo] = useState<string>();
  const form = useForm<z.infer<typeof signupSchema>>({ resolver: zodResolver(signupSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await authClient.signUp.email({ ...values, callbackURL: "/verify-email" });
    if (error) form.setError("root", { message: authErrorMessage(error) });
    else setSentTo(values.email);
  });

  if (sentTo) {
    return (
      <p role="status" className="text-sm">
        Check <strong>{sentTo}</strong> for a link to verify your email. It works for 24 hours.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate method="post" className="grid gap-4">
      <FormError message={errors.root?.message} />
      <TextField id="name" label="Name" autoComplete="name" error={errors.name?.message} {...form.register("name")} />
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...form.register("email")}
      />
      <TextField
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
        error={errors.password?.message}
        {...form.register("password")}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
