import { signOut } from "@/app/(auth)/actions";

export function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form action={signOut}>
      <button type="submit" className={className || "text-sm text-slate hover:text-ink"}>
        Sign out
      </button>
    </form>
  );
}
