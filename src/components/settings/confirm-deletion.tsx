"use client";

import Link from "next/link";
import { useState } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function ConfirmDeletion({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function deleteAccount() {
    setPending(true);
    setError("");
    try {
      const result = await authClient.deleteUser({ token });
      if (!result.error) {
        // A full page load, so nothing of the account stays in the browser's memory.
        window.location.replace("/account-deleted");
        return;
      }
      setError(
        result.error.status === 429
          ? "Too many attempts. Wait 15 minutes and try again."
          : "This link is invalid, has expired or is for another account. Nothing was deleted.",
      );
    } catch {
      setError("Something went wrong. Check your connection, then see whether you can still sign in.");
    }
    setPending(false);
  }

  return (
    <div className="grid gap-4">
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" disabled={pending} onClick={deleteAccount} className="max-sm:min-h-11">
          {pending ? "Deleting…" : "Delete permanently"}
        </Button>
        <Button asChild variant="outline" className="max-sm:min-h-11">
          <Link href="/app/settings?tab=data">Keep my account</Link>
        </Button>
      </div>
    </div>
  );
}
