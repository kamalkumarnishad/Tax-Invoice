import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { EmailRequestForm } from "@/components/auth/email-request-form";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

// The address holds a reset token, so it must not reach other sites as a referrer.
export const metadata: Metadata = { title: "Reset password", referrer: "no-referrer" };

type Props = { searchParams: Promise<{ token?: string; error?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token, error } = await searchParams;

  if (!token || error) {
    return (
      <AuthCard title="Reset password" description="That link is invalid or has expired. Request a new one.">
        <EmailRequestForm kind="reset" />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset password" description="Choose a new password for your account.">
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
