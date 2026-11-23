"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { FormError } from "@/components/forms/form-error";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { emailOnlySchema } from "@/validations/auth";

const kinds = {
  reset: {
    submit: "Send reset link",
    send: (email: string) => authClient.requestPasswordReset({ email, redirectTo: "/reset-password" }),
  },
  verification: {
    submit: "Send verification link",
    send: (email: string) => authClient.sendVerificationEmail({ email, callbackURL: "/verify-email" }),
  },
};

export function EmailRequestForm({ kind }: { kind: keyof typeof kinds }) {
  const [done, setDone] = useState(false);
  const form = useForm<z.infer<typeof emailOnlySchema>>({ resolver: zodResolver(emailOnlySchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    const { error } = await kinds[kind].send(email);
    if (error) form.setError("root", { message: authErrorMessage(error) });
    else setDone(true);
  });

  if (done) {
    return (
      <p role="status" className="text-sm">
        If an account needs it, a link is on its way to that address.
      </p>
    );
  }

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
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : kinds[kind].submit}
      </Button>
    </form>
  );
}
