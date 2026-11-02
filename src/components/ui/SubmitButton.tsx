"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children, className = "btn-primary w-full", disabled = false,
}: { children: React.ReactNode; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled}>
      {pending ? "Please wait…" : children}
    </button>
  );
}
