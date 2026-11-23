import type { Metadata } from "next";
import { FeatureGrid } from "@/components/shared/feature-grid";
import { features } from "@/config/marketing";

export const metadata: Metadata = {
  title: "Features",
  description: "What TaxPilot AI does today and what is planned.",
};

export default function FeaturesPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:px-6">
      <div className="grid max-w-2xl gap-3">
        <h1>Features</h1>
        <p className="text-lg text-muted-foreground">
          What you can use today, and what is on the way. India comes first. Other countries are added only after
          qualified professionals there have checked the rules.
        </p>
      </div>
      <FeatureGrid features={features} />
    </div>
  );
}
