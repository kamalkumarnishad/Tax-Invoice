import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { FeatureGrid } from "@/components/shared/feature-grid";
import { Button } from "@/components/ui/button";
import { features } from "@/config/marketing";
import { siteConfig } from "@/config/site";

const principles = [
  {
    title: "Rules, not guesses",
    text: "Tax figures come from fixed, versioned rules. AI never works out your tax.",
  },
  {
    title: "Every step shown",
    text: "Each estimate will list the slabs, deductions and rule versions behind it.",
  },
  {
    title: "Your data stays yours",
    text: "The database itself keeps each person's records separate.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="border-b bg-muted/40">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-20 md:px-6 md:py-28">
          <h1 className="max-w-3xl text-4xl text-balance md:text-5xl">{siteConfig.tagline}</h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            For freelancers, remote workers and agencies in India: one place for your clients, income and
            expenses today, with invoices and tax estimates being added step by step.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/signup">
                Get started <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/features">See features</Link>
            </Button>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-3 md:px-6">
        {principles.map(({ title, text }) => (
          <div key={title} className="grid content-start gap-2">
            <h2 className="text-lg md:text-xl">{title}</h2>
            <p className="text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>
      <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-20 md:px-6">
        <h2>What it covers</h2>
        <FeatureGrid features={features.slice(0, 6)} />
        <Button asChild variant="link" className="w-fit px-0">
          <Link href="/features">
            All features <ArrowRight />
          </Link>
        </Button>
      </section>
    </>
  );
}
