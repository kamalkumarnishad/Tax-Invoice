import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/page-header";
import { BusinessForm } from "@/components/settings/business-form";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { ChangePasswordForm, SessionList } from "@/components/settings/security-panel";
import { SettingsCard } from "@/components/settings/settings-card";
import { TaxProfileForm } from "@/components/settings/tax-profile-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSession, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { describeDevice, timezoneOptions } from "@/lib/options";
import { getBusiness } from "@/server/queries/invoices";
import { listActiveSessions } from "@/server/queries/sessions";
import { getCurrencies, getTaxProfile, getUserSettings } from "@/server/queries/settings";
import { taxProfileSchema } from "@/validations/settings";

export const metadata: Metadata = { title: "Settings" };

const tabs = ["profile", "business", "tax", "security"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const [{ tab }, current, sessions, settings, profile, currencies, business] = await Promise.all([
    searchParams,
    getSession(),
    getDb().then((db) => listActiveSessions(db, user.id)),
    getUserSettings(user.id),
    getTaxProfile(user.id),
    getCurrencies(user.id),
    getBusiness(user.id),
  ]);
  const timezone = settings?.timezone ?? "Asia/Kolkata";

  const blank = {
    taxYearStart: "2026-04-01",
    ageGroup: "under_60",
    regime: "new_regime",
    businessStructure: "freelancer",
    presumptiveTaxation: false,
    pan: "",
    removePan: false,
    gstin: "",
    hasLut: false,
    lutArn: "",
    lutValidFrom: "",
    lutValidTo: "",
  };
  const taxValues = taxProfileSchema.parse({
    ...blank,
    ...(profile && {
      taxYearStart: profile.taxYearStart,
      ageGroup: profile.ageGroup,
      regime: profile.regime ?? blank.regime,
      businessStructure: profile.businessStructure ?? blank.businessStructure,
      presumptiveTaxation: profile.presumptiveTaxation,
      gstin: profile.gstin ?? "",
      hasLut: profile.hasLut,
      lutArn: profile.lutArn ?? "",
      lutValidFrom: profile.lutValidFrom ?? "",
      lutValidTo: profile.lutValidTo ?? "",
    }),
  });

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader title="Settings" />
      <Tabs key={tab} defaultValue={tab && tabs.includes(tab) ? tab : "profile"} className="gap-6">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="tax">Tax profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="grid grid-cols-1 gap-6">
          <SettingsCard title="Profile">
            <ProfileForm name={user.name} email={user.email} />
          </SettingsCard>
          <SettingsCard title="Preferences">
            <PreferencesForm
              currencies={currencies}
              timezones={timezoneOptions(timezone)}
              values={{
                defaultCurrency: settings?.defaultCurrency ?? "INR",
                timezone,
                notificationsEnabled: settings?.notificationsEnabled ?? true,
              }}
            />
          </SettingsCard>
        </TabsContent>
        <TabsContent value="business">
          <SettingsCard title="Business details" description="Shown on your invoices. Issued invoices keep the details they were issued with.">
            <BusinessForm
              values={{
                businessName: business?.businessName ?? user.name,
                address: business?.address ?? "",
                email: business?.email ?? "",
                phone: business?.phone ?? "",
                paymentInstructions: business?.paymentInstructions ?? "",
              }}
            />
          </SettingsCard>
        </TabsContent>
        <TabsContent value="tax">
          <SettingsCard title="Tax profile" description="Used to estimate your tax. Estimates are not tax advice.">
            <TaxProfileForm values={taxValues} panLast4={profile?.panLast4 ?? null} />
          </SettingsCard>
        </TabsContent>
        <TabsContent value="security" className="grid grid-cols-1 gap-6">
          <SettingsCard title="Password" description="Changing it signs out your other devices.">
            <ChangePasswordForm />
          </SettingsCard>
          <SettingsCard title="Signed-in devices">
            <SessionList
              sessions={sessions.map((session) => ({
                id: session.id,
                device: describeDevice(session.userAgent),
                ipAddress: session.ipAddress || "Unknown address",
                signedIn: formatDate(session.createdAt, "en-IN", timezone),
                current: session.id === current?.session.id,
              }))}
            />
          </SettingsCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
