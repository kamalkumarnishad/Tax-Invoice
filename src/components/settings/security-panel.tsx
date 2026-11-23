"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { FormError } from "@/components/forms/form-error";
import { TextField } from "@/components/forms/text-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { changePasswordSchema, PASSWORD_MIN_LENGTH } from "@/validations/auth";

export function ChangePasswordForm() {
  const router = useRouter();
  const form = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current: "", password: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ current, password }) => {
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: password,
      revokeOtherSessions: true,
    });
    if (error) {
      const message = error.code === "INVALID_PASSWORD" ? "The current password is incorrect." : authErrorMessage(error);
      form.setError("root", { message });
      return;
    }
    form.reset();
    toast.success("Password changed. Other devices are signed out.");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate method="post" className="grid max-w-md gap-4">
      <FormError message={errors.root?.message} />
      <TextField
        id="current"
        label="Current password"
        type="password"
        autoComplete="current-password"
        error={errors.current?.message}
        {...form.register("current")}
      />
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
      <Button type="submit" disabled={isSubmitting} className="w-fit">
        Change password
      </Button>
    </form>
  );
}

export type SessionRow = { id: string; device: string; ipAddress: string; signedIn: string; current: boolean };

export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOutOthers() {
    setPending(true);
    const { error } = await authClient.revokeOtherSessions();
    setPending(false);
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }
    toast.success("Other devices are signed out");
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <ul className="divide-y">
        {sessions.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <div>
              <p className="font-medium">{session.device}</p>
              <p className="text-muted-foreground">
                {session.ipAddress} · signed in {session.signedIn}
              </p>
            </div>
            {session.current && <Badge variant="secondary">This device</Badge>}
          </li>
        ))}
      </ul>
      {sessions.length > 1 && (
        <Button variant="outline" className="w-fit" disabled={pending} onClick={signOutOthers}>
          Sign out other devices
        </Button>
      )}
    </div>
  );
}
