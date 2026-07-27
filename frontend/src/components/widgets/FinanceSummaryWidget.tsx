"use client";

import React from "react";
import { motion } from "framer-motion";

interface FinanceSummaryWidgetProps {
  data?: {
    amount?: number;
    tenure?: number;
    profit_rate?: string;
    monthly_installment?: number;
    total_payable?: number;
  };
}

export function FinanceSummaryWidget({ data }: FinanceSummaryWidgetProps) {
  const amount = data?.amount ?? 0;
  const tenure = data?.tenure ?? 0;
  const profitRate = data?.profit_rate ?? "";
  const monthlyInstallment = data?.monthly_installment ?? 0;
  const totalPayable = data?.total_payable ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] }}
      className="w-full max-w-sm mt-4"
    >
      <div className="journey-surface p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-white border border-[#D5DCE3] flex items-center justify-center shadow-sm flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#1B739E]">
              <path
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <h3 className="journey-heading">Finance Summary</h3>
            <p className="journey-label mt-1">Please review your plan</p>
          </div>
        </div>

        <div className="journey-panel p-4 mb-4">
          <p className="journey-label mb-1">Total Finance Amount</p>
          <div className="flex items-baseline gap-1">
            <p className="text-[28px] leading-[32px] font-semibold text-[#0D141A]">{amount.toLocaleString("en-IN")}</p>
            <span className="journey-value">SAR</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="journey-panel p-3">
            <p className="journey-label mb-1">Repayment</p>
            <p className="journey-value">{tenure} Months</p>
          </div>
          <div className="journey-panel p-3">
            <p className="journey-label mb-1">Profit Rate</p>
            <p className="journey-value">{profitRate}</p>
          </div>
          <div className="journey-panel p-3">
            <p className="journey-label mb-1">EMI</p>
            <p className="journey-value">
              {monthlyInstallment.toLocaleString("en-IN")} <span className="journey-label">SAR</span>
            </p>
          </div>
          <div className="journey-panel p-3">
            <p className="journey-label mb-1">Total Payable</p>
            <p className="journey-value">
              {totalPayable.toLocaleString("en-IN")} <span className="journey-label">SAR</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("mock-send-message", {
                  detail: {
                    visibleText: "Proceed to commodity trade",
                    systemText: "__SYS__continue",
                  },
                })
              );
            }}
            className="w-full py-3.5 journey-widget-button text-[14px] shadow-md hover:opacity-90 transition-all duration-300"
          >
            Proceed to commodity trade
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("mock-send-message", {
                  detail: "I wish to modify the amount/tenure",
                })
              );
            }}
            className="w-full py-3 journey-widget-button border border-transparent text-[14px] hover:opacity-90 transition-all duration-300"
          >
            Modify Amount or Tenure
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
