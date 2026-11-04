import { VendorShell } from "@/components/shells/VendorShell";
import { getVendorContext } from "@/lib/vendor";
import { createClient } from "@/lib/supabase/server";
import { VerificationClient } from "./VerificationClient";
import { getPartnerAgreement } from "@/lib/agreement";
import type { VendorDocument } from "@/lib/database.types";

export default async function VendorVerification() {
  const ctx = await getVendorContext();
  const supabase = createClient();

  const [{ data: docs }, { data: vendor }, agreement] = await Promise.all([
    supabase.from("vendor_documents").select("*").eq("vendor_id", ctx.vendorId).order("created_at", { ascending: false }),
    supabase.from("vendors").select("kyc_verified, terms_accepted_at").eq("id", ctx.vendorId).maybeSingle(),
    getPartnerAgreement(),
  ]);
  const v = vendor as { kyc_verified?: boolean; terms_accepted_at?: string | null } | null;

  return (
    <VendorShell active="/vendor/verification" vendorName={ctx.vendorName} isManager={ctx.isManager}
      staffName={ctx.profile.full_name} staffRole={ctx.roleLabel} branchName={ctx.branchName}>
      <h1 className="font-display text-2xl text-ink">Verification</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate">
        Upload your government ID and CAC registration certificate so we can verify your
        business. This is a background step — it doesn&apos;t hold up your onboarding or
        your ability to take orders.
      </p>
      <VerificationClient
        vendorId={ctx.vendorId}
        docs={(docs ?? []) as VendorDocument[]}
        kycVerified={Boolean(v?.kyc_verified)}
        termsAcceptedAt={v?.terms_accepted_at ?? null}
        isManager={ctx.isManager}
        agreement={agreement.clauses}
        agreementUpdatedAt={agreement.updatedAt}
      />
    </VendorShell>
  );
}
