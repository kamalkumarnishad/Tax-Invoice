import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type AuthCardProps = {
  title: string;
  description: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
};

export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl md:text-xl">{title}</h1>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
      {footer && <CardFooter className="justify-center text-sm text-muted-foreground">{footer}</CardFooter>}
    </Card>
  );
}
