import {
  Bot,
  CalendarClock,
  Calculator,
  Coins,
  FileSearch,
  FileText,
  Landmark,
  LockKeyhole,
  type LucideIcon,
  Users,
  Wallet,
} from "lucide-react";

/** `available: false` shows a "Planned" label, so the site never claims unbuilt features. */
export type Feature = { title: string; description: string; icon: LucideIcon; available: boolean };

export const features: Feature[] = [
  {
    title: "Tax profile",
    description: "Keep your tax year, regime, business structure and LUT details in one place.",
    icon: Landmark,
    available: true,
  },
  {
    title: "Private by design",
    description: "Encrypted PAN, database-level separation between users, and control over signed-in devices.",
    icon: LockKeyhole,
    available: true,
  },
  {
    title: "Tax calculator",
    description: "Rule-based estimates for India under the new and old regimes, with every step shown.",
    icon: Calculator,
    available: false,
  },
  {
    title: "Multi-currency income",
    description: "Record foreign payments with the rate, gateway fees and tax deducted at source.",
    icon: Coins,
    available: false,
  },
  {
    title: "Expenses",
    description: "Categories and receipts, ready when you work out your deductions.",
    icon: Wallet,
    available: false,
  },
  {
    title: "Invoices",
    description: "Multi-currency invoices as PDF, with GST and LUT details for exports.",
    icon: FileText,
    available: false,
  },
  {
    title: "Compliance calendar",
    description: "Advance tax, return and GST dates with reminders before each one.",
    icon: CalendarClock,
    available: false,
  },
  {
    title: "AI tax assistant",
    description: "Ask questions in English or Hindi and get answers that point to official sources.",
    icon: Bot,
    available: false,
  },
  {
    title: "AI tax auditor",
    description: "Compares your documents with your records and lists items that need review.",
    icon: FileSearch,
    available: false,
  },
  {
    title: "Teams",
    description: "Roles for agencies, finance managers and accountants.",
    icon: Users,
    available: false,
  },
];

/** AI limits from the plan. Prices are not decided, so none are shown. */
export const plans = [
  {
    name: "Free",
    audience: "For getting started",
    limits: { audits: "1 a month", messages: "20 a month" },
  },
  {
    name: "Pro",
    audience: "For freelancers",
    limits: { audits: "10 a month", messages: "Unlimited" },
  },
  {
    name: "Agency",
    audience: "For teams",
    limits: { audits: "50 a month", messages: "Unlimited" },
  },
] as const;
