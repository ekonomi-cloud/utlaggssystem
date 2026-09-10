import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireTreasurer } from "@/lib/dal";
import { driveConfigured } from "@/lib/drive";
import { mailTransport, transportLabel } from "@/lib/email";
import { formatDateTime } from "@/lib/format";
import { accountRetentionDays, draftRetentionDays, reminderDays } from "@/lib/config";
import { SettingsForm } from "@/components/SettingsForm";

export const metadata = { title: "Inställningar" };

export default async function SettingsPage() {
  const user = await requireTreasurer();
  const [profile, settings] = await Promise.all([
    prisma.treasurerProfile.findUnique({ where: { email: user.email } }),
    prisma.settings.findUnique({ where: { id: "default" } }),
  ]);
  return (
    <main className="container narrow">
      <div className="page-head">
        <h1>Inställningar</h1>
        <Link href="/admin" className="btn small">
          ← Kassörsvyn
        </Link>
      </div>
      <SettingsForm
        email={user.email}
        initialName={profile?.name ?? ""}
        initialSignature={profile?.signatureData ?? null}
        isAdmin={user.isAdmin}
        driveConfigured={driveConfigured()}
        mailLabel={transportLabel()}
        mailWorks={mailTransport() !== "outbox"}
        jobsLastRun={settings?.jobsLastRunAt ? formatDateTime(settings.jobsLastRunAt) : null}
        jobInfo={{ reminderDays: reminderDays(), accountDays: accountRetentionDays(), draftDays: draftRetentionDays() }}
      />
    </main>
  );
}
