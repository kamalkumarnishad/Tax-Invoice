import { cookies } from "next/headers";
import { AppSidebar } from "@/components/layouts/app-sidebar";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { siteConfig } from "@/config/site";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar user={{ name: user.name, email: user.email }} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4">
          <SidebarTrigger />
          <ThemeToggle />
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
        <footer className="border-t px-4 py-3 text-xs text-muted-foreground md:px-6">
          {siteConfig.disclaimers.slice(0, 2).join(" ")}
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
