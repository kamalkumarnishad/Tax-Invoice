"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { FormError } from "@/components/forms/form-error";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { PASSWORD_MIN_LENGTH, resetPasswordSchema } from "@/validations/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const form = useForm<z.infer<typeof resetPasswordSchema>>({ resolver: zodResolver(resetPasswordSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) form.setError("root", { message: authErrorMessage(error) });
    else setDone(true);
  });

  if (done) {
    return (
      <div role="status" className="grid gap-4 text-sm">
        <p>Your password is changed and other devices are signed out.</p>
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate method="post" className="grid gap-4">
      <FormError message={errors.root?.message} />
      <TextField
        id="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
        error={errors.password?.message}
        {...form.register("password")}
      />
      <TextField
        id="confirm"
        label="Repeat new password"
        type="password"
        autoComplete="new-password"
        error={errors.confirm?.message}
        {...form.register("confirm")}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
