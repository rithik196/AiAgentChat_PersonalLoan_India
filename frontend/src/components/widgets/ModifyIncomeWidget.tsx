"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { VOICE_WIDGET_FIELD_UPDATE_EVENT, type VoiceWidgetFieldUpdate } from "@/lib/voiceWidgetFields";

type ModifyIncomeWidgetData = {
  income?: {
    monthly?: string;
    obligations?: string;
    creditCardLimit?: string;
  };
};

export function ModifyIncomeWidget({ data, messageId }: { data?: ModifyIncomeWidgetData; messageId?: string }) {
  const initialMonthly = String(data?.income?.monthly || "35650").replace(/\D/g, "");
  const [monthlyIncome, setMonthlyIncome] = useState(initialMonthly || "35650");
  const obligations = data?.income?.obligations || "8750";
  const creditCardLimit = data?.income?.creditCardLimit || "SAR 20000";

  const normalizedMonthly = monthlyIncome.replace(/\D/g, "");
  const monthlyValue = Number(normalizedMonthly || "0");
  const isWithinRange = monthlyValue >= 5000 && monthlyValue <= 200000;

  const submitIncomeUpdate = React.useCallback(
    (monthly: string) => {
      window.dispatchEvent(
        new CustomEvent("mock-send-message", {
          detail: {
            visibleText: "Save updated income details",
            systemText: `__SYS__UPDATE_INCOME: ${JSON.stringify({
              monthly,
              obligations,
              creditCardLimit,
            })}`,
          },
        })
      );
    },
    [creditCardLimit, obligations]
  );

  React.useEffect(() => {
    const handleVoiceUpdate = (event: Event) => {
      const detail = (event as CustomEvent<VoiceWidgetFieldUpdate>).detail;
      if (!detail || detail.widget !== "ModifyIncomeWidget" || detail.messageId !== messageId) return;

      if (typeof detail.updates.monthlyIncome === "string") {
        const spokenMonthly = detail.updates.monthlyIncome.replace(/\D/g, "");
        const spokenMonthlyValue = Number(spokenMonthly || "0");

        setMonthlyIncome(spokenMonthly);
        if (spokenMonthlyValue >= 5000 && spokenMonthlyValue <= 200000) {
          submitIncomeUpdate(spokenMonthly);
        }
      }
    };

    window.addEventListener(VOICE_WIDGET_FIELD_UPDATE_EVENT, handleVoiceUpdate);
    return () => window.removeEventListener(VOICE_WIDGET_FIELD_UPDATE_EVENT, handleVoiceUpdate);
  }, [messageId, submitIncomeUpdate]);

  const handleSubmit = () => {
    submitIncomeUpdate(normalizedMonthly);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm mt-3">
      <div className="journey-surface p-5">
        <h3 className="journey-heading mb-4">Update Income Details</h3>

        <div className="flex flex-col gap-4">
          <div>
            <label className="journey-label mb-2 block">Monthly Income</label>
            <input
              type="text"
              value={monthlyIncome}
              inputMode="numeric"
              onChange={(e) => setMonthlyIncome(e.target.value.replace(/\D/g, ""))}
              placeholder="5000 - 200000"
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] placeholder:text-slate-400 focus:outline-none focus:border-blue-400"
            />
            <p className="mt-1 journey-label">Min Value - 5,000 | Max Value - 200,000</p>
            {!isWithinRange && (
              <p className="mt-1 text-[12px] font-normal text-rose-600">Enter a value within the allowed range.</p>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={!isWithinRange}
            className="w-full mt-2 py-2.5 journey-widget-button hover:opacity-90 transition-all"
          >
            Save Changes
          </button>
        </div>
      </div>
    </motion.div>
  );
}
