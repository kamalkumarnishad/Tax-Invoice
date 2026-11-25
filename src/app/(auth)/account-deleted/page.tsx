import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Account deleted" };

export default function AccountDeletedPage() {
  return (
    <AuthCard title="Account deleted" description="Your account and its data have been deleted.">
      <Button asChild variant="outline">
        <Link href="/">Go to the home page</Link>
      </Button>
    </AuthCard>
  );
}
