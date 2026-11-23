import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await requireUser();
  return <main className="p-6">Signed in as {user.email}</main>;
}
