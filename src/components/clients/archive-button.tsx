"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setClientActiveAction } from "@/server/actions/clients";

export function ArchiveButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      const result = await setClientActiveAction(id, !isActive);
      if (result.ok) toast.success(isActive ? "Client archived" : "Client restored");
      else toast.error(result.error);
    });

  return (
    <Button variant="outline" disabled={pending} onClick={toggle}>
      {isActive ? "Archive" : "Restore"}
    </Button>
  );
}
