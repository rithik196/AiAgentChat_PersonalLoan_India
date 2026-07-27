"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, PencilLine } from "lucide-react";
import { motion } from "framer-motion";
import {
  VOICE_WIDGET_FIELD_UPDATE_EVENT,
  VOICE_WIDGET_PROMPT_EVENT,
  type VoiceWidgetFieldUpdate,
} from "@/lib/voiceWidgetFields";

export interface ExpensesWidgetProps {
  messageId?: string;
  data?: {
    mode?: "review" | "edit";
    prefilled?: boolean;
    modifyDisabled?: boolean;
    totalExpenses?: number;
    breakdown?: Partial<Record<string, string | number>>;
  };
}

const EXPENSE_CATEGORIES = [
  { key: "housing", label: "Housing / Rent", icon: "🏠", placeholder: "e.g. 1500" },
  { key: "food", label: "Food & Groceries", icon: "🛒", placeholder: "e.g. 800" },
  { key: "utilities", label: "Utility Bills", icon: "💡", placeholder: "e.g. 400" },
  { key: "healthcare", label: "Healthcare", icon: "🏥", placeholder: "e.g. 300" },
  { key: "transportation", label: "Transportation", icon: "🚗", placeholder: "e.g. 600" },
  { key: "education", label: "Education", icon: "🎓", placeholder: "e.g. 500" },
];

const OPEN_BANKING_VALUES: Record<string, string> = {
  housing: "3000",
  food: "1500",
  utilities: "760",
  healthcare: "500",
  transportation: "1000",
  education: "800",
};

const CONFIRM_PROMPT = "Are these monthly expenses correct, or would you like to modify them?";

function buildInitialValues(data?: ExpensesWidgetProps["data"]): Record<string, string> {
  const source =
    data?.breakdown && Object.keys(data.breakdown).length > 0
      ? data.breakdown
      : data?.prefilled
        ? OPEN_BANKING_VALUES
        : {};

  return Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, String(source[c.key] ?? "")])) as Record<
    string,
    string
  >;
}

export function ExpensesWidget({ data, messageId }: ExpensesWidgetProps) {
  const modifyDisabled = data?.modifyDisabled ?? !data?.prefilled;
  const isFirstTimeEntry = !data?.prefilled && modifyDisabled;
  const initialMode = data?.mode === "edit" || !data?.prefilled ? "edit" : "review";
  const [mode, setMode] = useState<"review" | "edit" | "confirm">(initialMode);
  const [values, setValues] = useState<Record<string, string>>(() => buildInitialValues(data));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleVoiceUpdate = (event: Event) => {
      const detail = (event as CustomEvent<VoiceWidgetFieldUpdate>).detail;
      if (!detail || detail.widget !== "ExpensesWidget") return;
      if (messageId && detail.messageId !== messageId) return;

      setValues((prev) => {
        let changed = false;
        const next = { ...prev };

        for (const [key, value] of Object.entries(detail.updates)) {
          if (!EXPENSE_CATEGORIES.some((cat) => cat.key === key)) continue;
          const stringValue = String(value);
          if (next[key] !== stringValue) {
            next[key] = stringValue;
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    };

    window.addEventListener(VOICE_WIDGET_FIELD_UPDATE_EVENT, handleVoiceUpdate);
    return () => window.removeEventListener(VOICE_WIDGET_FIELD_UPDATE_EVENT, handleVoiceUpdate);
  }, [messageId]);

  const total = Object.values(values)
    .map((v) => parseFloat(v) || 0)
    .reduce((a, b) => a + b, 0);

  const allFilled = EXPENSE_CATEGORIES.every((c) => values[c.key] && parseFloat(values[c.key]) >= 0);

  const speakConfirmPrompt = () => {
    if (typeof document === "undefined") return;
    if (document.documentElement.dataset.voiceModeOpen !== "true") return;

    window.dispatchEvent(
      new CustomEvent(VOICE_WIDGET_PROMPT_EVENT, {
        detail: {
          messageId,
          widget: "ExpensesWidget",
          text: CONFIRM_PROMPT,
        },
      })
    );
  };

  const handleModify = () => {
    setMode("edit");
    setIsSubmitting(false);
    window.requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleConfirm = () => {
    setIsSubmitting(true);
    window.dispatchEvent(
      new CustomEvent("mock-send-message", {
        detail: {
          visibleText: "Save my expenses",
          systemText: `__SYS__UPDATE_EXPENSES_CONFIRM: ${JSON.stringify({
            breakdown: values,
            totalExpenses: total,
          })}`,
        },
      })
    );
  };

  const handleSubmit = () => {
    if (!allFilled) return;
    if (isFirstTimeEntry) {
      handleConfirm();
      return;
    }

    setMode("confirm");
    setIsSubmitting(false);
    speakConfirmPrompt();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-full max-w-sm mt-3"
    >
      <div ref={rootRef} className="journey-surface p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">📊</span>
          <h3 className="journey-heading">Monthly Expenses</h3>
        </div>
        <p className="journey-label mb-4 ml-9">
          {mode === "edit"
            ? isFirstTimeEntry
              ? "Enter your monthly expense amounts below, then continue."
              : "Edit the category amounts below, then save your changes."
            : mode === "confirm"
              ? CONFIRM_PROMPT
              : "Review the category breakdown below and confirm to continue."}
        </p>

        <div className="flex flex-col gap-3">
          {EXPENSE_CATEGORIES.map((cat) => (
            <div key={cat.key} className="flex items-center gap-3">
              <span className="text-xl w-7 text-center">{cat.icon}</span>
              <div className="flex-1">
                <div className="journey-label mb-0.5">{cat.label}</div>
                <div
                  className={`flex items-center border rounded-[16px] overflow-hidden ${
                    mode === "edit"
                      ? "bg-white border-[#D5DCE3] focus-within:ring-2 focus-within:ring-blue-400"
                      : "bg-slate-50 border-[#D5DCE3]"
                  }`}
                >
                  <span className="journey-label px-2">SAR</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={values[cat.key]}
                    onChange={(e) => setValues((prev) => ({ ...prev, [cat.key]: e.target.value }))}
                    placeholder={cat.placeholder}
                    disabled={mode !== "edit"}
                    readOnly={mode !== "edit"}
                    className={`flex-1 py-2 pr-3 text-[14px] leading-[16px] bg-transparent border-none focus:outline-none ${
                      mode === "edit" ? "text-[#0D141A] font-semibold" : "text-[#0D141A] font-normal cursor-default"
                    }`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-[#D5DCE3] flex justify-between items-center">
          <span className="journey-value">Total Monthly Expenses</span>
          <span className="journey-value text-blue-700">SAR {total.toLocaleString()}</span>
        </div>

        {mode === "edit" ? (
          <button
            onClick={handleSubmit}
            disabled={!allFilled}
            className="w-full mt-4 py-3 journey-widget-button shadow-md hover:opacity-90 transition-all disabled:opacity-40"
          >
            {isFirstTimeEntry ? (isSubmitting ? "Save Expenses" : "Save Expenses") : "Save Changes"}
          </button>
        ) : (
          <div className={`${modifyDisabled ? "grid grid-cols-1" : "grid grid-cols-2"} gap-3 mt-4`}>
            {!modifyDisabled && (
              <button
                onClick={handleModify}
                disabled={isSubmitting}
                className="w-full py-3 journey-widget-button border border-transparent transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <PencilLine size={16} />
                Modify
              </button>
            )}
            <button
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="w-full py-3 journey-widget-button shadow-md hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Check size={16} />
              {isSubmitting ? "Continuing..." : "Continue"}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
