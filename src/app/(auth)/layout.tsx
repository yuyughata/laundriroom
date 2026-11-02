import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-ivory">
      <div className="mx-auto flex min-h-screen max-w-phone flex-col px-6 py-10">
        <Link href="/"><Logo variant="dark" className="text-lg" /></Link>
        <div className="flex flex-1 flex-col justify-center">{children}</div>
      </div>
    </main>
  );
}
