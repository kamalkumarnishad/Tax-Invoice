import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/lib/auth";
import { safeRedirectPath } from "@/validations/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRedirectPath((await searchParams).next);
  if (await getSession()) redirect(next);

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back."
      footer={
        <p>
          New here?{" "}
          <Link href="/signup" className="text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </p>
      }
    >
      <LoginForm next={next} />
    </AuthCard>
  );
}
