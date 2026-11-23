"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { FormError } from "@/components/forms/form-error";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { loginSchema } from "@/validations/auth";

export function LoginForm({ next }: { next: string }) {
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await authClient.signIn.email({ ...values, callbackURL: next });
    if (!error) {
      // A full page load, so nothing cached from before sign-in is reused.
      window.location.assign(next);
      return;
    }
    const message =
      error.code === "EMAIL_NOT_VERIFIED"
        ? "Verify your email first. Use the link we sent, or ask for a new one below."
        : authErrorMessage(error);
    form.setError("root", { message });
  });

  return (
    <form onSubmit={onSubmit} noValidate method="post" className="grid gap-4">
      <FormError message={errors.root?.message} />
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
        autoComplete="current-password"
        error={errors.password?.message}
        {...form.register("password")}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/forgot-password" className="underline underline-offset-4">
          Forgot password?
        </Link>
        <Link href="/verify-email" className="underline underline-offset-4">
          Resend verification
        </Link>
      </div>
    </form>
  );
}
