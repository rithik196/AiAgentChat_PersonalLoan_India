"use client";

export const VOICE_WIDGET_FIELD_UPDATE_EVENT = "voice-widget-field-update";
export const VOICE_WIDGET_PROMPT_EVENT = "voice-widget-prompt";

export type EditableVoiceWidget =
  | "ModifyPersonalWidget"
  | "ModifyAddressWidget"
  | "ModifyEmploymentWidget"
  | "ModifyIncomeWidget"
  | "OfferSliderWidget"
  | "ExpensesWidget";

export type VoiceWidgetFieldUpdate = {
  messageId: string;
  widget: EditableVoiceWidget;
  updates: Record<string, string | number>;
};

const EDITABLE_WIDGETS = new Set<EditableVoiceWidget>([
  "ModifyPersonalWidget",
  "ModifyAddressWidget",
  "ModifyEmploymentWidget",
  "ModifyIncomeWidget",
  "OfferSliderWidget",
  "ExpensesWidget",
]);

export function isEditableVoiceWidget(widget: string | null | undefined): widget is EditableVoiceWidget {
  return Boolean(widget && EDITABLE_WIDGETS.has(widget as EditableVoiceWidget));
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const DIGIT_WORDS: Record<string, string> = {
  zero: "0",
  oh: "0",
  o: "0",
  one: "1",
  won: "1",
  two: "2",
  to: "2",
  too: "2",
  three: "3",
  four: "4",
  for: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  ate: "8",
  nine: "9",
};

const EDUCATION_OPTIONS = [
  "Graduation",
  "Primary Education",
  "Intermediate (Middle School)",
  "Secondary (High School)",
  "Diploma (Associate / Intermediate)",
  "Bachelor's Degree",
  "Master's Degree",
  "Doctorate (PhD)",
];

const MARITAL_OPTIONS = ["Single", "Married", "Divorced", "Widowed", "Separated", "Polygamous"];

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function numberFromSpeech(value: string): number | null {
  const compact = value.replace(/,/g, "").trim();
  if (!compact) return null;

  const digitTokens = compact
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (DIGIT_WORDS[token] !== undefined) return DIGIT_WORDS[token];
      if (/^\d+$/.test(token)) return token;
      return "";
    })
    .filter(Boolean);

  if (digitTokens.length >= 2) {
    const digitStream = digitTokens.join("");
    const parsedDigits = Number(digitStream);
    if (!Number.isNaN(parsedDigits)) {
      return parsedDigits;
    }
  }

  const digitMatch = compact.match(/\d+(?:\.\d+)?/);
  if (digitMatch) {
    const parsed = Number(digitMatch[0]);
    if (/\b(thousand|k)\b/i.test(compact)) return parsed * 1000;
    if (/\b(million|m)\b/i.test(compact)) return parsed * 1000000;
    return parsed;
  }

  const words: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  };
  const tokens = compact
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return null;

  let total = 0;
  let current = 0;
  let sawNumber = false;

  for (const token of tokens) {
    if (words[token] !== undefined) {
      current += words[token];
      sawNumber = true;
    } else if (token === "hundred") {
      current = Math.max(current, 1) * 100;
      sawNumber = true;
    } else if (token === "thousand") {
      total += Math.max(current, 1) * 1000;
      current = 0;
      sawNumber = true;
    } else if (token === "million") {
      total += Math.max(current, 1) * 1000000;
      current = 0;
      sawNumber = true;
    }
  }

  return sawNumber ? total + current : null;
}

function expenseAmountFromSpeech(value: string): number | null {
  const compact = value.replace(/,/g, "").trim();
  if (!compact) return null;

  const explicitNumbers = compact.match(/\d+(?:\.\d+)?/g);
  if (explicitNumbers?.length) {
    const lastNumber = Number(explicitNumbers[explicitNumbers.length - 1]);
    if (Number.isNaN(lastNumber)) return null;
    if (/\b(thousand|k)\b/i.test(compact)) return lastNumber * 1000;
    if (/\b(million|m)\b/i.test(compact)) return lastNumber * 1000000;
    return lastNumber;
  }

  const amountOnly = compact
    .toLowerCase()
    .replace(
      /\b(update|change|set|replace|make|modify|my|the|expense|expenses|amount|cost|value|to|as|is|equals|equal|be|with)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  return numberFromSpeech(amountOnly);
}

function extractValueAfter(text: string, fieldPattern: string): string {
  const forwardMatch = text.match(
    new RegExp(`(?:${fieldPattern})(?:\\s+(?:to|as|is|equals|equal to|be|with))?\\s+(.+)$`, "i")
  );
  if (forwardMatch?.[1]) {
    return forwardMatch[1].trim().replace(/[.?!]$/g, "").trim();
  }

  const backwardMatch = text.match(new RegExp(`(.+?)\\s+(?:${fieldPattern})\\b`, "i"));
  if (!backwardMatch?.[1]) return "";
  return backwardMatch[1]
    .trim()
    .replace(/[.?!]$/g, "")
    .trim()
    .split(/\s+/)
    .slice(-5)
    .join(" ");
}

function cleanEmail(value: string): string {
  return value
    .replace(/\s+at\s+/gi, "@")
    .replace(/\s+dot\s+/gi, ".")
    .replace(/\s+/g, "")
    .replace(/,+$/g, "");
}

function closestOption(value: string, options: string[]): string {
  const normalizedValue = normalize(value);
  const match = options.find((option) => {
    const normalizedOption = normalize(option);
    return normalizedValue === normalizedOption || normalizedValue.includes(normalizedOption) || normalizedOption.includes(normalizedValue);
  });
  return match || titleCase(value);
}

function exactOptionMatch(value: string, options: string[]): string | null {
  const normalizedValue = normalize(value);
  const match = options.find((option) => normalize(option) === normalizedValue);
  return match || null;
}

function parsePersonal(text: string): Record<string, string> | null {
  if (/\b(email|email id|mail)\b/.test(text)) {
    const explicitEmail = text.match(/[a-z0-9._%+-]+(?:@|\s+at\s+)[a-z0-9.-]+(?:\.|\s+dot\s+)[a-z]{2,}/i)?.[0];
    const raw = explicitEmail || extractValueAfter(text, "email(?: id)?|mail");
    const email = cleanEmail(raw);
    return email ? { email } : null;
  }

  if (/\b(education|level of education|qualification)\b/.test(text)) {
    const value = extractValueAfter(text, "level of education|education|qualification");
    if (!value) return null;
    return {
      levelOfEducation: closestOption(value, EDUCATION_OPTIONS),
    };
  }

  const directEducation = exactOptionMatch(text, EDUCATION_OPTIONS);
  if (directEducation) {
    return { levelOfEducation: directEducation };
  }

  if (/\b(marital|marital status|single|married|divorced|widowed|separated)\b/.test(text)) {
    const value = extractValueAfter(text, "marital status|marital") || text;
    return { maritalStatus: closestOption(value, MARITAL_OPTIONS) };
  }

  const directMarital = exactOptionMatch(text, MARITAL_OPTIONS);
  if (directMarital) {
    return { maritalStatus: directMarital };
  }

  if (/\b(dependents?|number of dependents?)\b/.test(text)) {
    const value = extractValueAfter(text, "number of dependents?|dependents?");
    const count = numberFromSpeech(value || text);
    if (count === null) return null;
    return { dependents: count >= 6 ? "6+" : String(count) };
  }

  if (/^(?:zero|one|two|three|four|five|six|seven|eight|nine|\d+|six plus|6\+)$/i.test(text)) {
    const count = numberFromSpeech(text);
    if (count !== null) {
      return { dependents: count >= 6 ? "6+" : String(count) };
    }
  }

  return null;
}

function parseAddress(text: string): Record<string, string> | null {
  const fields: Array<[RegExp, string, string]> = [
    [/\b(address line 1|line one|line 1)\b/, "line1", "address line 1|line one|line 1"],
    [/\b(address line 2|line two|line 2)\b/, "line2", "address line 2|line two|line 2"],
    [/\bstreet\b/, "street", "street"],
    [/\bcity\b/, "city", "city"],
    [/\b(postal code|post code|zip code)\b/, "postalCode", "postal code|post code|zip code"],
    [/\b(house type|home type|accommodation)\b/, "houseType", "house type|home type|accommodation"],
  ];

  for (const [matcher, key, pattern] of fields) {
    if (!matcher.test(text)) continue;
    const value = extractValueAfter(text, pattern);
    if (!value) return null;
    return { [key]: key === "city" || key === "houseType" ? titleCase(value) : value };
  }

  return null;
}

function parseEmployment(text: string): Record<string, string> | null {
  const fields: Array<[RegExp, string, string]> = [
    [/\b(employer type|employment type)\b/, "employerType", "employer type|employment type"],
    [/\b(employer name|company name|employer)\b/, "employerName", "employer name|company name|employer"],
    [/\b(industry type|industry)\b/, "industry", "industry type|industry"],
    [/\b(total experience|experience)\b/, "experience", "total experience|experience"],
    [/\b(work address|office address)\b/, "workAddress", "work address|office address"],
    [/\b(work city|office city)\b/, "workCity", "work city|office city"],
    [/\b(work post code|work postal code|office postal code)\b/, "workPostalCode", "work post code|work postal code|office postal code"],
  ];

  for (const [matcher, key, pattern] of fields) {
    if (!matcher.test(text)) continue;
    const value = extractValueAfter(text, pattern);
    if (!value) return null;
    return { [key]: key === "workCity" || key === "employerType" || key === "industry" ? titleCase(value) : value };
  }

  return null;
}

function parseIncome(text: string): Record<string, string> | null {
  const candidate = /\b(monthly income|income|salary)\b/.test(text)
    ? extractValueAfter(text, "monthly income|income|salary") || text
    : text;
  const amount = numberFromSpeech(candidate);
  return amount === null ? null : { monthlyIncome: String(Math.round(amount)) };
}

function extractTenureValue(text: string): number | null {
  const beforeMonths = text.match(/([a-z0-9\s-]{1,40})\s+months?\b/i);
  if (beforeMonths?.[1]) {
    return numberFromSpeech(beforeMonths[1]);
  }
  return null;
}

function parseOffer(text: string): Record<string, number> | null {
  const updates: Record<string, number> = {};

  const tenureFromUnit = extractTenureValue(text);
  if (tenureFromUnit !== null) {
    updates.tenure = Math.round(tenureFromUnit);
  }

  if (/\b(amount|finance amount|loan amount)\b/.test(text)) {
    const amount = numberFromSpeech(extractValueAfter(text, "finance amount|loan amount|amount") || text);
    if (amount !== null) {
      updates.amount = Math.round(amount);
    }
  }

  if (/\b(tenure|months?|duration)\b/.test(text)) {
    const tenure = numberFromSpeech(extractValueAfter(text, "tenure|months?|duration") || text);
    if (tenure !== null) {
      updates.tenure = Math.round(tenure);
    }
  }

  if (Object.keys(updates).length === 0) {
    const fallbackAmount = numberFromSpeech(text);
    if (fallbackAmount !== null) {
      updates.amount = Math.round(fallbackAmount);
    }
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

function parseExpenses(text: string): Record<string, string> | null {
  const fields: Array<[RegExp, string, string]> = [
    [/\b(housing|rent)\b/, "housing", "housing|rent"],
    [/\b(food|groceries)\b/, "food", "food|groceries"],
    [/\b(utilities|utility bills?)\b/, "utilities", "utilities|utility bills?"],
    [/\b(healthcare|medical|health)\b/, "healthcare", "healthcare|medical|health"],
    [/\b(transportation|transport|travel)\b/, "transportation", "transportation|transport|travel"],
    [/\b(education|school|tuition)\b/, "education", "education|school|tuition"],
  ];

  for (const [matcher, key, pattern] of fields) {
    if (!matcher.test(text)) continue;
    const amount = expenseAmountFromSpeech(extractValueAfter(text, pattern) || text);
    if (amount === null) return null;
    return { [key]: String(Math.round(amount)) };
  }

  return null;
}

function parseWidgetUpdate(widget: EditableVoiceWidget, transcript: string): Record<string, string | number> | null {
  const text = normalize(transcript);
  switch (widget) {
    case "ModifyPersonalWidget":
      return parsePersonal(text);
    case "ModifyAddressWidget":
      return parseAddress(text);
    case "ModifyEmploymentWidget":
      return parseEmployment(text);
    case "ModifyIncomeWidget":
      return parseIncome(text);
    case "OfferSliderWidget":
      return parseOffer(text);
    case "ExpensesWidget":
      return parseExpenses(text);
    default:
      return null;
  }
}

export function resolveVisibleVoiceWidgetUpdate(
  messageId: string | undefined,
  widgetName: string | null | undefined,
  transcript: string
): VoiceWidgetFieldUpdate | null {
  if (!messageId || !isEditableVoiceWidget(widgetName)) return null;

  const updates = parseWidgetUpdate(widgetName, transcript);
  if (!updates || Object.keys(updates).length === 0) return null;

  return { messageId, widget: widgetName, updates };
}

export function dispatchVoiceWidgetFieldUpdate(update: VoiceWidgetFieldUpdate): void {
  window.dispatchEvent(new CustomEvent<VoiceWidgetFieldUpdate>(VOICE_WIDGET_FIELD_UPDATE_EVENT, { detail: update }));
}
