"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";

interface IBANValidationWidgetProps {
  data?: {
    iban?: string;
    bank?: string;
    beneficiary?: string;
    valid?: boolean;
    reason?: string;
  };
}

export function IBANValidationWidget({ data }: IBANValidationWidgetProps) {
  const [confirmed, setConfirmed] = useState(false);
  const isValid = data?.valid === true;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-sm mt-3"
    >
      <div className="journey-surface p-5">
        <h3 className={`journey-heading mb-2 ${isValid ? "text-emerald-900" : "text-red-900"}`}>
          {isValid ? "IBAN Verified" : "IBAN Not Valid"}
        </h3>
        <p className="journey-body text-[#425768] mb-3">{data?.reason}</p>

        {isValid && data?.bank && (
          <div className="journey-panel p-3 mb-3">
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="journey-label">IBAN:</span>
                <span className="journey-value tabular-nums">{data.iban}</span>
              </div>
              <div className="flex justify-between">
                <span className="journey-label">Bank:</span>
                <span className="journey-value">{data.bank}</span>
              </div>
              <div className="flex justify-between">
                <span className="journey-label">Beneficiary:</span>
                <span className="journey-value">{data.beneficiary}</span>
              </div>
            </div>
          </div>
        )}

        {isValid && (
          <div className="flex items-start gap-2 mb-3">
            <input
              type="checkbox"
              id="iban-confirmed"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 w-4 h-4 accent-[#1B739E]"
            />
            <label htmlFor="iban-confirmed" className="journey-label">
              Yes, this is the correct account for disbursement
            </label>
          </div>
        )}

        <button
          onClick={() => {
            if (!isValid) {
              window.dispatchEvent(
                new CustomEvent("mock-send-message", {
                  detail: "Let me enter a different IBAN",
                })
              );
            } else if (confirmed) {
              window.dispatchEvent(
                new CustomEvent("mock-send-message", {
                  detail: "Confirm and proceed",
                })
              );
            }
          }}
          disabled={isValid && !confirmed}
          className="w-full py-3 journey-widget-button shadow-md hover:opacity-90 transition-all disabled:opacity-50"
        >
          {isValid && confirmed ? "Proceed to Summary" : isValid ? "Confirm IBAN" : "Try Different IBAN"}
        </button>
      </div>
    </motion.div>
  );
}
