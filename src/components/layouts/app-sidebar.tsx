"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/shared/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { appNav, type NavItem } from "@/config/nav";
import { siteConfig } from "@/config/site";
import { UserMenu } from "./user-menu";

function NavEntry({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate: () => void }) {
  const { title, icon: Icon, href } = item;

  if (!href) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton disabled>
          <Icon />
          <span>{title}</span>
        </SidebarMenuButton>
        <SidebarMenuBadge className="font-normal text-muted-foreground">Soon</SidebarMenuBadge>
      </SidebarMenuItem>
    );
  }

  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={title}>
        <Link href={href} aria-current={active ? "page" : undefined} onClick={onNavigate}>
          <Icon />
          <span>{title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const closeOnMobile = () => setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/app/dashboard" onClick={closeOnMobile}>
                <LogoMark />
                <span className="font-semibold">{siteConfig.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main">
          {appNav.map((group) => (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <NavEntry key={item.title} item={item} pathname={pathname} onNavigate={closeOnMobile} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
