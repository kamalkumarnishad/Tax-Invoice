"use client";

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

type ConfirmActionProps = {
  label: string;
  title: string;
  description: string;
  done: string;
  action: () => Promise<ActionResult>;
  destructive?: boolean;
};

/** For a step that cannot be undone and keeps the user on the same page. */
export function ConfirmAction({ label, title, description, done, action, destructive }: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    const result = await action();
    setPending(false);
    setOpen(false);
    if (result.ok) toast.success(done);
    else toast.error(result.error);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={destructive ? "outline" : "default"} className={destructive ? "text-destructive" : undefined}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Go back
          </Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={pending} onClick={confirm}>
            {pending ? "Working…" : label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
