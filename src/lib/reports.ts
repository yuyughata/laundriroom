import type { UserRole } from "@/lib/database.types";

export function scopeLabel(role: UserRole): string {
  if (role === "platform_admin" || role === "support_agent") return "Scope: all vendors (platform-wide)";
  if (role === "attendant" || role === "vendor_manager" || role === "rider") return "Scope: your station";
  return "Scope: your account";
}

export function genDateLine(): string {
  const d = new Date().toLocaleString("en-NG", {
    timeZone: "Africa/Lagos", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  return `Generated ${d}`;
}

export function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
