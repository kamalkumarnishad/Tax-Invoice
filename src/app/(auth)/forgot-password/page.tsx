import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { EmailRequestForm } from "@/components/auth/email-request-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot password"
      description="We will email you a link that works for one hour."
      footer={
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <EmailRequestForm kind="reset" />
    </AuthCard>
  );
}
