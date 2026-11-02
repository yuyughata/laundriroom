"use client";

import { useState, useTransition } from "react";
import { resolveBankAccount, saveVendorPayoutAccount } from "../actions";
import { NG_BANKS } from "@/lib/banks";
import type { VendorPayoutAccount } from "@/lib/database.types";

export function PayoutAccount({
  vendorId, account, isManager,
}: { vendorId: string; account: VendorPayoutAccount | null; isManager: boolean }) {
  const [edit, setEdit] = useState(!account);
  const [pending, start] = useTransition();
  const [bankCode, setBankCode] = useState(account?.bank_code ?? NG_BANKS[0].code);
  const [acct, setAcct] = useState(account?.account_number ?? "");
  const [name, setName] = useState(account?.account_name ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  const masked = (n: string) => n.length >= 4 ? `••••••${n.slice(-4)}` : n;

  if (!isManager) {
    return (
      <div className="card p-5">
        <p className="label">Payout account</p>
        {account
          ? <p className="text-sm text-ink">{account.bank_name ?? account.bank_code} · {masked(account.account_number)}{account.account_name ? ` · ${account.account_name}` : ""}</p>
          : <p className="text-sm text-slate">Not set. Your manager can add the bank account payouts are sent to.</p>}
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="label mb-0">Payout account</p>
        {account && !edit && <button className="btn-ghost text-xs" onClick={() => setEdit(true)}>Change</button>}
      </div>
      <p className="mt-1 text-xs text-slate">The bank account your payouts are transferred to.</p>

      {!edit && account ? (
        <div className="mt-3 text-sm text-ink">
          <p className="font-medium">{account.account_name ?? "Account"}</p>
          <p className="text-slate">{account.bank_name ?? account.bank_code} · {masked(account.account_number)}</p>
          {!account.recipient_code && <p className="mt-1 text-xs text-warn">Will be registered with Paystack on your next payout.</p>}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <label className="label">Bank</label>
            <select className="field" value={bankCode} onChange={(e) => { setBankCode(e.target.value); setName(""); }}>
              {NG_BANKS.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Account number</label>
            <div className="flex gap-2">
              <input className="field" inputMode="numeric" maxLength={10} placeholder="0123456789"
                value={acct} onChange={(e) => { setAcct(e.target.value.replace(/\D/g, "")); setName(""); }} />
              <button className="btn-ghost text-xs" disabled={pending || acct.length !== 10}
                onClick={() => { setMsg(null); start(async () => {
                  const r = await resolveBankAccount(acct, bankCode);
                  if (r && "error" in r && r.error) setMsg(r.error);
                  else if (r.account_name) { setName(r.account_name); setMsg("Verified."); }
                }); }}>
                Verify name
              </button>
            </div>
          </div>
          <div>
            <label className="label">Account name</label>
            <input className="field" placeholder="As it appears on the account"
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-primary" disabled={pending || acct.length !== 10 || !name}
              onClick={() => { setMsg(null); start(async () => {
                const fd = new FormData();
                fd.set("vendor_id", vendorId); fd.set("bank_code", bankCode);
                fd.set("bank_name", NG_BANKS.find((b) => b.code === bankCode)?.name ?? "");
                fd.set("account_number", acct); fd.set("account_name", name);
                const r = await saveVendorPayoutAccount(fd);
                if (r && "error" in r && r.error) setMsg(r.error);
                else { setMsg("Saved."); setEdit(false); }
              }); }}>
              {pending ? "Saving…" : "Save account"}
            </button>
            {account && <button className="btn-ghost text-xs" onClick={() => setEdit(false)}>Cancel</button>}
          </div>
          {msg && <p className="text-xs text-teal">{msg}</p>}
        </div>
      )}
    </div>
  );
}
