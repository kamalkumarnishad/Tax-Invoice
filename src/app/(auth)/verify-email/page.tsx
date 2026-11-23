import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { EmailRequestForm } from "@/components/auth/email-request-form";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Verify your email" };

/** Verification links return here, signed in on success or with ?error on failure. */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error && (await getSession())) redirect("/app/dashboard");

  return (
    <AuthCard
      title="Verify your email"
      description={
        error ? "That link is invalid or has expired. Request a new one." : "Request a new verification link."
      }
    >
      <EmailRequestForm kind="verification" />
    </AuthCard>
  );
}
