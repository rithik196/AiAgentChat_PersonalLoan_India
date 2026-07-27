"use client";

import React from "react";
import { motion } from "framer-motion";
import { Landmark, Upload } from "lucide-react";

export function IncomeProofChoiceWidget() {
  const choose = (value: string, visibleText: string) => {
    window.dispatchEvent(
      new CustomEvent("mock-send-message", {
        detail: {
          visibleText,
          systemText: `__SYS__${value}`,
        },
      })
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-sm mt-3"
    >
      <div className="journey-surface p-5">
        <h3 className="journey-heading mb-2">Verify Income</h3>
        <p className="journey-body mb-4">
          Please choose how you would like to verify your updated income.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => choose("upload_statement", "Upload Bank Statement")}
            className="w-full flex items-center justify-start gap-3 p-3.5 rounded-[16px] bg-white border border-[#D5DCE3] transition-all text-left hover:bg-[#F8FAFC]"
          >
            <span className="w-10 h-10 rounded-[16px] bg-blue-50 flex items-center justify-center text-blue-700 shrink-0">
              <Upload size={18} />
            </span>
            <span className="min-w-0">
              <span className="block journey-value pb-1">Upload Bank Statement</span>
              <span className="block journey-label leading-tight">Use the attachment icon in chat</span>
            </span>
          </button>

          <button
            onClick={() => choose("open_banking", "Open Banking")}
            className="w-full flex items-center justify-start gap-3 p-3.5 rounded-[16px] bg-white border border-[#D5DCE3] transition-all text-left hover:bg-[#F8FAFC]"
          >
            <span className="w-10 h-10 rounded-[16px] bg-emerald-50 flex items-center justify-center text-emerald-700 shrink-0">
              <Landmark size={18} />
            </span>
            <span className="min-w-0 ">
              <span className="block journey-value pb-1">Open Banking</span>
              <span className="block journey-label leading-tight">We will send a link to your registered Email ID</span>
            </span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
