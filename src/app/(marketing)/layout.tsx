import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { marketingNav } from "@/config/nav";
import { siteConfig } from "@/config/site";

function NavLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Main" className={className}>
      {marketingNav.map(({ title, href }) => (
        <Link key={href} href={href} className="text-sm text-muted-foreground hover:text-foreground">
          {title}
        </Link>
      ))}
    </nav>
  );
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
          <Link href="/">
            <Logo />
          </Link>
          <NavLinks className="hidden gap-6 sm:flex" />
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Logo />
            <div className="flex gap-6">
              <NavLinks className="flex gap-6" />
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground sm:hidden">
                Sign in
              </Link>
            </div>
          </div>
          <div className="grid gap-1 text-xs text-muted-foreground">
            {siteConfig.disclaimers.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
