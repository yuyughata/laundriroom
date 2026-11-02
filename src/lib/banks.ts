/**
 * Nigerian banks with their Paystack / NIP codes, for the payout-account form.
 * Account-name resolution and transfers use these codes against Paystack.
 * This is a convenience list; Paystack's GET /bank is the source of truth.
 */
export const NG_BANKS: { code: string; name: string }[] = [
  { code: "044", name: "Access Bank" },
  { code: "063", name: "Access Bank (Diamond)" },
  { code: "035", name: "Wema Bank" },
  { code: "058", name: "Guaranty Trust Bank (GTBank)" },
  { code: "057", name: "Zenith Bank" },
  { code: "011", name: "First Bank of Nigeria" },
  { code: "033", name: "United Bank for Africa (UBA)" },
  { code: "070", name: "Fidelity Bank" },
  { code: "214", name: "First City Monument Bank (FCMB)" },
  { code: "032", name: "Union Bank of Nigeria" },
  { code: "232", name: "Sterling Bank" },
  { code: "221", name: "Stanbic IBTC Bank" },
  { code: "050", name: "Ecobank Nigeria" },
  { code: "076", name: "Polaris Bank" },
  { code: "082", name: "Keystone Bank" },
  { code: "215", name: "Unity Bank" },
  { code: "101", name: "Providus Bank" },
  { code: "301", name: "Jaiz Bank" },
  { code: "100", name: "SunTrust Bank" },
  { code: "302", name: "TAJ Bank" },
  { code: "51211", name: "Kuda Microfinance Bank" },
  { code: "999992", name: "OPay" },
  { code: "999991", name: "PalmPay" },
  { code: "50515", name: "Moniepoint MFB" },
  { code: "50211", name: "Carbon" },
  { code: "090267", name: "Kuda (alt)" },
  { code: "566", name: "VFD Microfinance Bank" },
];
