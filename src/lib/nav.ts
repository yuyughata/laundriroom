/**
 * Return path after sign-in/sign-up (`?next=`). Only same-site paths are
 * allowed, so a crafted link can't bounce someone to another website.
 */
export function safeNext(next: unknown): string | null {
  const s = typeof next === "string" ? next.trim() : "";
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\")) return null;
  return s;
}
