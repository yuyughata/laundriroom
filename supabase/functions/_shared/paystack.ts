// deno-lint-ignore-file no-explicit-any
// Shared Paystack Transfers helpers used by the payout flow.
// All calls use the secret key server-side only.

const BASE = "https://api.paystack.co";

function headers(key: string) {
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/** Your available Paystack balance in NGN (transfers draw from this). */
export async function getBalanceNGN(key: string): Promise<number> {
  const res = await fetch(`${BASE}/balance`, { headers: headers(key) });
  const body = await res.json();
  if (!body.status) throw new Error(body.message || "balance check failed");
  // Paystack returns an array of balances (per currency) in kobo.
  const ngn = (body.data as any[]).find((b) => b.currency === "NGN");
  return ngn ? Number(ngn.balance) / 100 : 0;
}

/** Create a transfer recipient (once per bank account) → returns RCP_ code. */
export async function createRecipient(
  key: string, name: string, accountNumber: string, bankCode: string,
): Promise<string> {
  const res = await fetch(`${BASE}/transferrecipient`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      type: "nuban", name, account_number: accountNumber,
      bank_code: bankCode, currency: "NGN",
    }),
  });
  const body = await res.json();
  if (!body.status) throw new Error(body.message || "recipient creation failed");
  return body.data.recipient_code as string;
}

/** Initiate a transfer. amountNGN is in naira; converted to kobo here. */
export async function initiateTransfer(
  key: string, recipientCode: string, amountNGN: number, reference: string, reason: string,
): Promise<{ status: string; transfer_code: string }> {
  const res = await fetch(`${BASE}/transfer`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(amountNGN * 100), // kobo
      recipient: recipientCode,
      reference,
      reason,
    }),
  });
  const body = await res.json();
  if (!body.status) throw new Error(body.message || "transfer failed");
  return { status: body.data.status as string, transfer_code: body.data.transfer_code as string };
}
