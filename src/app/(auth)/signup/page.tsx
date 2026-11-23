import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignupPage() {
  if (await getSession()) redirect("/app/dashboard");

  return (
    <AuthCard
      title="Create an account"
      description="Track income and estimate your tax."
      footer={
        <p>
          Already registered?{" "}
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
