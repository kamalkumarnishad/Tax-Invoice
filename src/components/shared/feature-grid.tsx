import { Badge } from "@/components/ui/badge";
import type { Feature } from "@/config/marketing";

export function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {features.map(({ title, description, icon: Icon, available }) => (
        <li key={title} className="grid content-start gap-3 rounded-lg border bg-card p-6">
          <div className="flex items-center justify-between">
            <Icon className="size-5 text-brand-strong" aria-hidden="true" />
            <Badge variant={available ? "secondary" : "outline"}>{available ? "Available" : "Planned"}</Badge>
          </div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </li>
      ))}
    </ul>
  );
}
