"use client";

import type { UIMessage } from "@ai-sdk/react";

export type VoiceResolvedAction = {
  messageId: string;
  buttonLabels: string[];
  clickFirstButtonIfDisabled?: boolean;
  clickCheckboxFirst?: boolean;
  fallbackVisibleText?: string;
  fallbackSystemText?: string;
};

type WidgetSpec = {
  widget?: string;
  data?: unknown;
};

type VoiceOption = {
  id: string;
  label: string;
  value: string;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAnyPhrase(text: string, phrases: string[]): boolean {
  const normalizedText = normalize(text);
  return phrases.some((phrase) => normalizedText.includes(normalize(phrase)));
}

function widgetSpec(message: UIMessage | undefined): WidgetSpec {
  return ((message?.metadata as { widget?: WidgetSpec } | undefined)?.widget || {}) as WidgetSpec;
}

function buildOptionAction(message: UIMessage | undefined, transcript: string): VoiceResolvedAction | null {
  if (!message) return null;
  const metadata = (message.metadata || {}) as {
    options?: VoiceOption[];
  };

  const options = metadata.options || [];
  if (options.length === 0) return null;

  const normalizedTranscript = normalize(transcript);
  if (!normalizedTranscript) return null;

  const ranked = options
    .map((option) => {
      const candidates = [option.label, option.value].filter(Boolean);
      let score = 0;

      for (const candidate of candidates) {
        const normalizedCandidate = normalize(candidate);
        if (!normalizedCandidate) continue;

        if (normalizedTranscript === normalizedCandidate) {
          score = Math.max(score, 4);
        } else if (
          normalizedTranscript.startsWith(`${normalizedCandidate} `) ||
          normalizedTranscript.endsWith(` ${normalizedCandidate}`) ||
          normalizedTranscript.includes(` ${normalizedCandidate} `)
        ) {
          score = Math.max(score, 3);
        } else if (normalizedTranscript.includes(normalizedCandidate) && normalizedCandidate.length >= 3) {
          score = Math.max(score, 2);
        }
      }

      return { option, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.option;
  if (!best) return null;

  return {
    messageId: message.id,
    buttonLabels: [best.label, best.value],
  };
}

function widgetAction(message: UIMessage | undefined, transcript: string): VoiceResolvedAction | null {
  if (!message) return null;

  const { widget, data } = widgetSpec(message);
  if (!widget) return null;

  const normalized = normalize(transcript);
  if (!normalized) return null;

  const action = (labels: string[], extras?: Partial<VoiceResolvedAction>): VoiceResolvedAction => ({
    messageId: message.id,
    buttonLabels: labels,
    ...extras,
  });

  const categoryButtons = Array.isArray((data as { categories?: string[] } | undefined)?.categories)
    ? ((data as { categories?: string[] }).categories || [])
    : ["Cash Finance", "Finance Type 2", "Finance Type 3"];

  switch (widget) {
    case "WelcomeWidget":
      for (const category of categoryButtons) {
        if (matchesAnyPhrase(normalized, [category])) {
          return action([category]);
        }
      }
      if (matchesAnyPhrase(normalized, ["cash finance", "finance type 2", "finance type 3"])) {
        return action(categoryButtons);
      }
      return null;

    case "NTBIntroductionWidget":
      if (matchesAnyPhrase(normalized, ["let's begin", "lets begin", "begin", "start"])) {
        return action(["Let's Begin", "Let's begin"]);
      }
      return null;

    case "PersonalDetailsWidget":
      if (matchesAnyPhrase(normalized, ["modify details", "change details", "edit details", "update details"])) {
        return action(["Modify Details"], {
          fallbackVisibleText: "Modify Details",
          fallbackSystemText: "__SYS__modify_section",
        });
      }
      if (matchesAnyPhrase(normalized, ["confirm and continue", "confirm continue", "continue", "proceed", "done"])) {
        return action(["Confirm & Continue", "Confirm and Continue"], {
          fallbackVisibleText: "Details confirmed",
          fallbackSystemText: "__SYS__continue",
        });
      }
      return null;

    case "ModifySectionWidget":
      if (matchesAnyPhrase(normalized, ["personal details", "personal"])) {
        return action(["Personal Details"]);
      }
      if (matchesAnyPhrase(normalized, ["address details", "address"])) {
        return action(["Address Details"]);
      }
      if (matchesAnyPhrase(normalized, ["employment details", "employment", "job", "work"])) {
        return action(["Employment Details"]);
      }
      if (matchesAnyPhrase(normalized, ["income details", "income", "salary"])) {
        return action(["Income Details"]);
      }
      return null;

    case "ModifyPersonalWidget":
      if (matchesAnyPhrase(normalized, ["save changes", "save updated personal details", "save personal"])) {
        return action(["Save Changes"]);
      }
      return null;

    case "ModifyAddressWidget":
      if (matchesAnyPhrase(normalized, ["save changes", "save updated address details", "save address"])) {
        return action(["Save Changes"]);
      }
      return null;

    case "ModifyEmploymentWidget":
      if (matchesAnyPhrase(normalized, ["save changes", "save updated employment details", "save employment"])) {
        return action(["Save Changes"]);
      }
      return null;

    case "ModifyIncomeWidget":
      if (matchesAnyPhrase(normalized, ["save changes", "save updated income details", "save income"])) {
        return action(["Save Changes"]);
      }
      return null;

    case "IncomeProofChoiceWidget":
      if (matchesAnyPhrase(normalized, ["upload bank statement", "upload statement", "statement", "upload"])) {
        return action(["Upload Bank Statement"]);
      }
      if (matchesAnyPhrase(normalized, ["open banking", "banking link", "link my bank"])) {
        return action(["Open Banking"]);
      }
      return null;

    case "OtpVerificationWidget":
      if (matchesAnyPhrase(normalized, ["sms otp", "otp verification", "otp", "sms"])) {
        return action(["SMS OTP"]);
      }
      if (matchesAnyPhrase(normalized, ["ivr call", "ivr verification", "call"])) {
        return action(["IVR Call"]);
      }
      return null;

    case "FinalIVRConsentWidget":
      if (matchesAnyPhrase(normalized, ["send me an otp", "send otp", "otp verification", "sms otp", "verify with otp", "otp"])) {
        return action(["OTP Verification", "SMS OTP"]);
      }
      if (matchesAnyPhrase(normalized, ["call me for ivr verification", "ivr call", "ivr"])) {
        return action(["IVR Call Verification", "IVR Call"]);
      }
      if (matchesAnyPhrase(normalized, ["do not consent", "i do not consent", "no consent", "decline"])) {
        return action(["I do not consent"]);
      }
      return null;

    case "EligibleOfferWidget":
      if (matchesAnyPhrase(normalized, ["review details and proceed", "continue", "proceed", "review details"])) {
        return action(["Review Details & Proceed"], {
          fallbackVisibleText: "I had reviewed the offer details and wish to proceed",
          fallbackSystemText: "__SYS__continue",
        });
      }
      return null;

    case "PreApprovedOfferWidget":
      if (matchesAnyPhrase(normalized, ["go with offer", "accept offer", "take offer"])) {
        return action(["Go with offer"], {
          fallbackVisibleText: "Go with offer",
          fallbackSystemText: "__SYS__accepted_pre_approved_offer",
        });
      }
      if (matchesAnyPhrase(normalized, ["need higher amount", "higher amount", "more amount"])) {
        return action(["Need higher amount"], {
          fallbackVisibleText: "I need higher amount",
          fallbackSystemText: "__SYS__higher_amount_requested",
        });
      }
      return null;

    case "WantsMoreDecisionWidget":
      if (matchesAnyPhrase(normalized, ["amount is okay", "okay", "accept", "eligible finance offer", "proceed", "yes"])) {
        return action(["Proceed", "Amount is okay", "Accept eligible finance offer"], {
          fallbackVisibleText: "Amount is okay",
          fallbackSystemText: "__SYS__accepted_max_offer",
        });
      }
      if (matchesAnyPhrase(normalized, ["request for a higher amount", "higher amount", "want more", "need higher amount"])) {
        return action(["Need Higher Amount", "Request for Higher Amount"], {
          fallbackVisibleText: "I need a higher amount",
          fallbackSystemText: "__SYS__higher_amount_requested",
        });
      }
      return null;

    case "HigherAmountReviewWidget":
      if (matchesAnyPhrase(normalized, ["submit for review", "submit review", "review now"])) {
        return action(["Submit for review"], {
          fallbackVisibleText: "Submit for review",
          fallbackSystemText: "__SYS__submit_higher_amount_review",
        });
      }
      if (matchesAnyPhrase(normalized, ["go back", "back"])) {
        return action(["Go back"], {
          fallbackVisibleText: "Go back",
          fallbackSystemText: "__SYS__higher_amount_review_go_back",
        });
      }
      return null;

    case "OfferSliderWidget":
      if (matchesAnyPhrase(normalized, ["confirm finance plan", "confirm plan", "confirm", "done", "proceed"])) {
        return action(["Confirm Finance Plan"]);
      }
      return null;

    case "FinanceSummaryWidget":
      if (matchesAnyPhrase(normalized, ["confirm finance plan", "confirm plan", "proceed", "commodity trade", "next step"])) {
        return action(["Proceed to commodity trade", "Confirm Finance Plan"], {
          fallbackVisibleText: "Proceed to commodity trade",
          fallbackSystemText: "__SYS__continue",
        });
      }
      if (matchesAnyPhrase(normalized, ["request higher amount", "higher amount", "modify amount", "modify tenure"])) {
        return action(["Modify Amount or Tenure", "Request higher amount"], {
          fallbackVisibleText: "I wish to modify the amount/tenure",
        });
      }
      return null;

    case "ExpensesWidget":
      if (matchesAnyPhrase(normalized, ["modify expenses", "edit expenses", "change expenses", "modify"])) {
        return action(["Modify"]);
      }
      if (matchesAnyPhrase(normalized, ["save changes", "save updated expenses", "save"])) {
        return action(["Save Changes"]);
      }
      if (matchesAnyPhrase(normalized, ["continue", "confirm expenses", "confirm", "proceed"])) {
        return action(["Continue"]);
      }
      return null;

    case "GenerateContractWidget":
      if (matchesAnyPhrase(normalized, [
        "continue",
        "proceed",
        "go ahead",
        "next",
        "generate contract",
        "generate documents",
        "show documents",
        "promissory note",
      ])) {
        return action(["Generate Contract & Promissory Note"], {
          fallbackVisibleText: "Generate the Contract & Promissory Note",
          fallbackSystemText: "__SYS__proceed_esign",
        });
      }
      return null;

    case "DocumentPreviewWidget":
      if (matchesAnyPhrase(normalized, ["next step", "proceed to next step"])) {
        return action(["Proceed to next step"], {
          fallbackVisibleText: "Proceed to next step",
          fallbackSystemText: "__SYS__proceed_contract_prompt",
        });
      }
      if (matchesAnyPhrase(normalized, ["continue", "proceed"])) {
        return action(["Proceed to next step", "E-Sign via Nafath", "Proceed to e-sign"], {
          fallbackVisibleText: "E-Sign via Nafath",
          fallbackSystemText: "__SYS__proceed_esign",
        });
      }
      if (matchesAnyPhrase(normalized, ["e sign", "esign", "proceed to e sign", "proceed to e-sign", "nafath", "sign documents"])) {
        return action(["E-Sign via Nafath", "Generate Contract & Promissory Note", "Proceed to e-sign"], {
          fallbackVisibleText: "E-Sign via Nafath",
          fallbackSystemText: "__SYS__proceed_esign",
        });
      }
      return null;

    case "CommodityTradeAuthorizationWidget":
      if (matchesAnyPhrase(normalized, ["i authorize the trade", "authorize the trade", "authorize trade", "commodity trade", "yes authorize", "authorize"])) {
        return action(["Authorize Trade"], {
          clickCheckboxFirst: true,
          clickFirstButtonIfDisabled: true,
          fallbackVisibleText: "I authorize the commodity trade.",
          fallbackSystemText: "__SYS__continue",
        });
      }
      return null;

    case "ApplicationSummaryWidget":
      if (matchesAnyPhrase(normalized, ["confirm", "i confirm", "confirm details", "yes confirm", "confirm and proceed", "final verification", "proceed"])) {
        return action(["Confirm & Proceed"], {
          clickCheckboxFirst: true,
          fallbackVisibleText: "I confirm all details. Proceed for final verification.",
          fallbackSystemText: "__SYS__continue",
        });
      }
      return null;

    case "IBANValidationWidget":
      if (matchesAnyPhrase(normalized, ["proceed to summary", "confirm iban", "proceed", "confirm"])) {
        return action(["Proceed to Summary", "Confirm IBAN"], {
          clickCheckboxFirst: true,
          clickFirstButtonIfDisabled: true,
          fallbackVisibleText: "Confirm and proceed",
        });
      }
      if (matchesAnyPhrase(normalized, ["try different iban", "different iban", "enter another iban"])) {
        return action(["Try Different IBAN", "Let me enter a different IBAN"], {
          fallbackVisibleText: "Let me enter a different IBAN",
        });
      }
      return null;

    case "AccountSelectorWidget":
      if (matchesAnyPhrase(normalized, ["use selected account", "selected account", "use this account", "proceed with this account"])) {
        return action(["Use Selected Account"], { clickFirstButtonIfDisabled: true });
      }
      if (matchesAnyPhrase(normalized, ["validate iban", "verify iban"])) {
        return action(["Validate IBAN"]);
      }
      if (matchesAnyPhrase(normalized, ["enter iban manually", "manual iban", "or enter iban manually"])) {
        return action(["Or enter IBAN manually"]);
      }
      if (matchesAnyPhrase(normalized, ["back to existing account", "back to existing accounts", "go back to accounts"])) {
        return action(["Back to Existing Accounts"]);
      }
      return null;

    case "NafathWidget":
      if (matchesAnyPhrase(normalized, ["did not receive the request", "did not receive", "not receive", "resend"])) {
        return action(["Did not receive the request"]);
      }
      return null;

    case "VerificationSuccessWidget":
    case "LoadingWidget":
      if (matchesAnyPhrase(normalized, ["continue", "proceed", "done"])) {
        return action(["Continue"]);
      }
      return null;

    default:
      return null;
  }
}

export function resolveVoiceJourneyAction(
  activeAssistant: UIMessage | undefined,
  latestOptionPrompt: UIMessage | undefined,
  transcript: string
): VoiceResolvedAction | null {
  return buildOptionAction(latestOptionPrompt, transcript) || widgetAction(activeAssistant, transcript);
}
