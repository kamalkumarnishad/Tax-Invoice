import {
  Bot,
  CalendarClock,
  Calculator,
  ChartColumn,
  Coins,
  CreditCard,
  FileSearch,
  FileText,
  Landmark,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

/** Items without an href are planned but not built yet. */
export type NavItem = { title: string; icon: LucideIcon; href?: string };
export type NavGroup = { title: string; items: NavItem[] };

export const appNav: NavGroup[] = [
  {
    title: "Overview",
    items: [{ title: "Dashboard", icon: LayoutDashboard, href: "/app/dashboard" }],
  },
  {
    title: "Money",
    items: [
      { title: "Income", icon: TrendingUp, href: "/app/income" },
      { title: "Expenses", icon: Wallet, href: "/app/expenses" },
      { title: "Clients", icon: Users, href: "/app/clients" },
      { title: "Invoices", icon: FileText },
      { title: "Currency analyzer", icon: Coins },
    ],
  },
  {
    title: "Tax",
    items: [
      { title: "Tax calculator", icon: Calculator, href: "/app/tax-calculator" },
      { title: "GST / VAT", icon: Landmark },
      { title: "Compliance", icon: CalendarClock },
      { title: "Reports", icon: ChartColumn, href: "/app/reports" },
    ],
  },
  {
    title: "AI",
    items: [
      { title: "Tax auditor", icon: FileSearch },
      { title: "Tax assistant", icon: Bot },
    ],
  },
  {
    title: "Account",
    items: [
      { title: "Settings", icon: Settings, href: "/app/settings" },
      { title: "Billing", icon: CreditCard },
    ],
  },
];

export const marketingNav = [
  { title: "Features", href: "/features" },
  { title: "Pricing", href: "/pricing" },
] as const;
