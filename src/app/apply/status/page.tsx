import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { createClient } from "@/lib/supabase/server";
import { dateShort } from "@/lib/format";

export const metadata = { title: "Your application · laundriroom" };
export const dynamic = "force-dynamic";

type ApplicationRow = {
  business_name: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export default async function ApplicationStatusPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/apply/status");

  const { data } = await supabase
    .from("vendor_applications")
    .select("business_name, status, created_at")
    .eq("applicant_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const app = data as ApplicationRow | null;

  return (
    <main className="min-h-screen bg-ivory">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-6 py-10">
        <Link href="/"><Logo variant="dark" className="text-lg" /></Link>
        <div className="mt-10">
          <h1 className="font-display text-3xl text-ink">Your partner application</h1>

          {!app ? (
            <div className="card mt-6 p-6 text-center">
              <p className="text-sm text-slate">
                We couldn&apos;t find an application for your account yet.
              </p>
              <Link href="/apply" className="btn-primary mt-4 inline-block">Apply to partner</Link>
            </div>
          ) : (
            <div className="card mt-6 space-y-3 p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-xl text-ink">{app.business_name}</p>
                <StatusBadge status={app.status} />
              </div>
              <p className="text-xs text-slate">Submitted {dateShort(app.created_at)}</p>

              {app.status === "pending" && (
                <p className="text-sm text-ink/70">
                  Thanks for applying! Our team is reviewing your details. We&apos;ll email you
                  when there&apos;s an update — you can sign in here anytime to check back.
                </p>
              )}
              {app.status === "approved" && (
                <div className="space-y-3">
                  <p className="text-sm text-ink/70">
                    You&apos;re approved — welcome aboard. Your account can now manage your
                    laundry: set up your branches, price list and team from the dashboard.
                  </p>
                  <Link href="/vendor/queue" className="btn-primary inline-block">Go to my dashboard</Link>
                </div>
              )}
              {app.status === "rejected" && (
                <p className="text-sm text-ink/70">
                  We weren&apos;t able to approve this application. If you think this is a
                  mistake or your details have changed, please reach out to our team.
                </p>
              )}
            </div>
          )}

          <p className="mt-6 text-center text-xs text-slate">
            <Link href="/customer" className="underline">Back to my account</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: ApplicationRow["status"] }) {
  const map: Record<ApplicationRow["status"], { label: string; cls: string }> = {
    pending: { label: "Under review", cls: "bg-warn/15 text-warn" },
    approved: { label: "Approved", cls: "bg-teal/15 text-teal" },
    rejected: { label: "Not approved", cls: "bg-danger/15 text-danger" },
  };
  const s = map[status];
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}
