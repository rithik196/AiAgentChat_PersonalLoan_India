"use client";

import React from "react";

const IMPORTANT_PATTERN =
  /(\b\d[\d,]*(?:\.\d+)?%?\b|\bSAR\b|\bIBAN\b|\bOTP\b|\bEMI\b|\bID\b|\bMo\b|\bMonths?\b|\bYears?\b|\bDays?\b|\bHours?\b|\bMinutes?\b)/g;

function isImportantToken(token: string) {
  return /^(?:\d[\d,]*(?:\.\d+)?%?|SAR|IBAN|OTP|EMI|ID|Mo|Months?|Years?|Days?|Hours?|Minutes?)$/.test(token);
}

export function ImportantText({ text }: { text: string }) {
  const parts = text.split(IMPORTANT_PATTERN).filter(Boolean);

  return (
    <>
      {parts.map((part, index) =>
        isImportantToken(part) ? (
          <strong key={`${part}-${index}`} className="font-semibold text-[#0D141A]">
            {part}
          </strong>
        ) : (
          <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
        )
      )}
    </>
  );
}
