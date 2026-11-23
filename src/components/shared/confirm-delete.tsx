"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/server/services/shared";

type ConfirmDeleteProps = {
  /** What is being deleted, e.g. "client". */
  noun: string;
  name: string;
  action: () => Promise<ActionResult>;
  returnTo: string;
};

export function ConfirmDelete({ noun, name, action, returnTo }: ConfirmDeleteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    const result = await action();
    setPending(false);
    setOpen(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Deleted ${noun}`);
    router.push(returnTo);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this {noun}?</DialogTitle>
          <DialogDescription>“{name}” will be removed for good. This cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={confirm}>
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
