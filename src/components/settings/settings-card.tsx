import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SettingsCardProps = { title: string; description?: string; children: React.ReactNode };

export function SettingsCard({ title, description, children }: SettingsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-lg md:text-lg">{title}</h2>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
