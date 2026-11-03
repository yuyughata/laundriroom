"use client";

import { useState, type InputHTMLAttributes } from "react";

/**
 * Password field with a Show/Hide button, so people can check what they've
 * typed. Drop-in replacement for <input type="password" className="field" …>.
 */
export function PasswordInput({ className = "field", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className={`${className} pr-16`}
        autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="button" onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
        className="absolute inset-y-0 right-0 flex items-center px-4 text-xs font-medium text-slate hover:text-ink">
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}
