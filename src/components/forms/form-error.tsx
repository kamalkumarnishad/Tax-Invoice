import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
