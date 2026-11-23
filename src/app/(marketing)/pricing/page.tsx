import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { plans } from "@/config/marketing";

export const metadata: Metadata = { title: "Pricing", description: "Planned TaxPilot AI plans." };

export default function PricingPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:px-6">
      <div className="grid max-w-2xl gap-3">
        <h1>Pricing</h1>
        <p className="text-lg text-muted-foreground">
          Everything available today is free while we build. Paid plans and their prices will be announced later.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name}>
            <CardHeader>
              <CardTitle>
                <h2 className="text-xl md:text-xl">{plan.name}</h2>
              </CardTitle>
              <CardDescription>{plan.audience}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm">
                <div className="flex justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">AI audit reports</dt>
                  <dd className="font-medium">{plan.limits.audits}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">AI assistant messages</dt>
                  <dd className="font-medium">{plan.limits.messages}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">Limits are planned and apply once the AI features launch.</p>
      <Button asChild size="lg" className="w-fit">
        <Link href="/signup">Get started free</Link>
      </Button>
    </div>
  );
}
