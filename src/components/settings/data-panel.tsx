"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Download } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormError } from "@/components/forms/form-error";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { requestDeletionAction } from "@/server/actions/account";
import { CONFIRM_WORD, deletionSchema, passwordSchema } from "@/validations/account";

const OFFLINE = "Something went wrong. Check your connection and try again.";

/** Hands a file that is already in the browser to the user. */
function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Some browsers start reading only after the click has been handled.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function DownloadForm() {
  const form = useForm<{ password: string }>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      // In the body of a request, so the password never appears in an address.
      const response = await fetch("/app/settings/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        form.setError("root", { message: (await response.text()) || OFFLINE });
        return;
      }
      const name = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1];
      saveFile(await response.blob(), name ?? "taxpilot-data.zip");
      form.reset();
      toast.success("Your data is downloaded");
    } catch {
      form.setError("root", { message: OFFLINE });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate method="post" className="grid max-w-md gap-4">
      <FormError message={errors.root?.message} />
      <TextField
        id="download-password"
        label="Your password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...form.register("password")}
      />
      <Button type="submit" variant="outline" disabled={isSubmitting} className="w-fit max-sm:min-h-11">
        <Download /> {isSubmitting ? "Preparing…" : "Download my data"}
      </Button>
    </form>
  );
}

export function DeleteForm({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const form = useForm<{ password: string; confirm: string }>({
    resolver: zodResolver(deletionSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (input) => {
    try {
      const result = await requestDeletionAction(input);
      if (!result.ok) {
        form.setError("root", { message: result.error });
        return;
      }
      form.reset();
      setSent(true);
    } catch {
      form.setError("root", { message: OFFLINE });
    }
  });

  if (sent) {
    return (
      <p role="status" className="text-sm">
        Check <strong className="break-all">{email}</strong> for a link. Open it within an hour, in this browser.
        Nothing is deleted until you confirm there.
      </p>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate method="post" autoComplete="off" className="grid max-w-md gap-4">
      <FormError message={errors.root?.message} />
      <TextField
        id="delete-password"
        label="Your password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...form.register("password")}
      />
      <TextField
        id="delete-confirm"
        label={`Type ${CONFIRM_WORD}`}
        autoComplete="off"
        error={errors.confirm?.message}
        {...form.register("confirm")}
      />
      <Button type="submit" variant="destructive" disabled={isSubmitting} className="w-fit max-sm:min-h-11">
        {isSubmitting ? "Sending…" : "Email me a deletion link"}
      </Button>
    </form>
  );
}
