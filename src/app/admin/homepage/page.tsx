import { AdminShell } from "@/components/shells/AdminShell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HomepageEditor } from "./HomepageEditor";
import { SectionsManager } from "./SectionsManager";
import type { HomeSectionRow } from "@/lib/homepageSections";

/** Admin → Homepage: edit the public landing-page copy. */
export default async function AdminHomepage() {
  const profile = await requireRole(["platform_admin"]);
  const supabase = createClient();
  const { data, error } = await supabase.from("homepage_content" as never).select("key, value");
  const values = Object.fromEntries(
    ((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]),
  ) as Record<string, string>;
  const { data: sectionRows } = await supabase.from("homepage_sections" as never)
    .select("*").order("position");
  const sections = (sectionRows ?? []) as HomeSectionRow[];

  return (
    <AdminShell active="/admin/homepage" name={profile.full_name} role={profile.role}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Homepage</h1>
        <a href="/" target="_blank" rel="noopener noreferrer" className="btn-ghost px-3 py-2 text-xs">View homepage ↗</a>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate">
        Edit the copy on the public landing page — headings, descriptions and button labels, section by
        section. Anything you leave blank uses the built-in default, and changes go live immediately.
      </p>

      {error ? (
        <p className="mt-6 rounded-card bg-warn/10 px-4 py-3 text-sm text-warn">
          Homepage content can&apos;t be edited until database migration 0055 is applied.
        </p>
      ) : (
        <>
          <HomepageEditor values={values} />
          <SectionsManager sections={sections} />
        </>
      )}
    </AdminShell>
  );
}
