"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1>Something went wrong</h1>
      <p className="text-muted-foreground">Try loading the page again.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
