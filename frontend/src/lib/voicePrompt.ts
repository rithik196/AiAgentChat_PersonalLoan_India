const OFFER_LEAD_IN = "I have prepared the offer details for you.";

type DisbursementVoiceData = {
  customer_name?: string;
  reference?: string;
  date?: string;
  amount?: number;
  account?: string;
  tenure?: string;
  profit_rate?: string;
  first_installment?: string;
  monthly_installment?: number;
  total_payable?: number;
  bank?: string;
  beneficiary?: string;
};

function cleanForVoice(text: string): string {
  const normalized = text
    .replace(/<WIDGET_DATA>[\s\S]*?<\/WIDGET_DATA>/g, "")
    .replace(/\*\*/g, "")
    .replace(/[#_~`>]/g, "")
    .replace(/\r\n/g, "\n");

  return normalized
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripRedundantLeadIns(text: string): string {
  return text
    .replace(new RegExp(`^${OFFER_LEAD_IN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "")
    .trim();
}

// Expand uppercase abbreviations into spaced letters so TTS pronounces them
// correctly (e.g. "OTP" → "O. T. P." instead of reading it as a word).
const TTS_ABBREVIATIONS: [RegExp, string][] = [
  [/\bOTP\b/g,  "O. T. P."],
  [/\bIVR\b/g,  "I. V. R."],
  [/\bSMS\b/g,  "S. M. S."],
  [/\bSAMA\b/g, "S. A. M. A."],
  [/\bIBAN\b/g, "I. B. A. N."],
  [/\bEMI\b/g,  "E. M. I."],
  [/\bNTB\b/g,  "N. T. B."],
  [/\bKYC\b/g,  "K. Y. C."],
];

function expandAbbreviationsForTTS(text: string): string {
  let result = text;
  for (const [pattern, replacement] of TTS_ABBREVIATIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function formatSarAmount(amount: number | undefined): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  return `SAR ${amount.toLocaleString("en-IN")}`;
}

function buildMaskedAccountSummary(account: string | undefined): string | null {
  const raw = (account || "").trim();
  if (!raw) return null;
  if (raw.includes("****")) return raw;

  const compact = raw.replace(/\s+/g, "");
  if (compact.length <= 4) return raw;
  return `account ending ${compact.slice(-4)}`;
}

export function buildDisbursementVoiceSummary(data?: DisbursementVoiceData | null): string | null {
  if (!data) return null;

  const parts: string[] = [];
  const amount = formatSarAmount(data.amount);
  const monthlyInstallment = formatSarAmount(data.monthly_installment);
  const totalPayable = formatSarAmount(data.total_payable);
  const accountSummary = buildMaskedAccountSummary(data.account);

  parts.push("Congratulations. Your cash finance has been successfully disbursed.");

  if (amount) {
    parts.push(`Finance amount is ${amount}.`);
  }
  if (data.tenure) {
    parts.push(`Repayment period is ${data.tenure}.`);
  }
  if (data.profit_rate) {
    parts.push(`Profit rate is ${data.profit_rate}.`);
  }
  if (monthlyInstallment) {
    parts.push(`Monthly installment is ${monthlyInstallment}.`);
  }
  if (totalPayable) {
    parts.push(`Total amount payable is ${totalPayable}.`);
  }
  if (data.first_installment) {
    parts.push(`Your first installment is due on ${data.first_installment}.`);
  }

  const destinationDetails = [data.bank, data.beneficiary, accountSummary].filter(Boolean);
  if (destinationDetails.length > 0) {
    parts.push(`Disbursement has been sent to ${destinationDetails.join(", ")}.`);
  }

  if (data.reference) {
    parts.push(`Reference number is ${data.reference}.`);
  }
  if (data.date) {
    parts.push(`Disbursement date is ${data.date}.`);
  }

  parts.push("You can now review the full details on screen.");

  const summary = parts.join(" ");
  return expandAbbreviationsForTTS(summary);
}

export function buildVoicePreviewText(text: string): string {
  const clean = stripRedundantLeadIns(cleanForVoice(text));
  if (!clean) {
    return "I am ready when you are.";
  }

  const lower = clean.toLowerCase();
  if (lower.includes("welcome") && lower.includes("national id")) {
    return "Hi, I am Raya, your finance assistant. I will guide you through this application. Please tell me your National ID when you are ready.";
  }

  return expandAbbreviationsForTTS(clean);
}

export function buildVoiceSpeechText(text: string): string {
  const clean = stripRedundantLeadIns(cleanForVoice(text));
  if (!clean) {
    return "I am ready when you are.";
  }

  const lower = clean.toLowerCase();
  if (lower.includes("welcome") && lower.includes("national id")) {
    return "Hi, I am Raya, your finance assistant. I will guide you through this application. Please tell me your National ID when you are ready.";
  }

  return expandAbbreviationsForTTS(clean);
}

export function buildVoicePrompt(text: string): string {
  return buildVoiceSpeechText(text);
}
