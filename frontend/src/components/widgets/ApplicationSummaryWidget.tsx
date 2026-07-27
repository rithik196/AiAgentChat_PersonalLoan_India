"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";

interface ApplicationSummaryWidgetProps {
  data?: {
    personalDetails?: {
      name: string;
      idNumber: string;
      phone: string;
    };
    financeSummary?: {
      amount: number;
      tenure: number;
      profit_rate: string;
      monthly_installment: number;
      total_payable: number;
    };
    account?: {
      bank: string;
      iban: string;
      beneficiary: string;
    };
    is_etb?: boolean;
  };
}

export function ApplicationSummaryWidget({ data }: ApplicationSummaryWidgetProps) {
  const [readConfirmed, setReadConfirmed] = useState(false);

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as [number, number, number, number], staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.4 } }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-sm mt-4"
    >
      <div className="journey-surface p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-white border border-[#D5DCE3] flex items-center justify-center shadow-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#1B739E]">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h3 className="journey-heading">Application Summary</h3>
            <p className="journey-label mt-1">Final Review</p>
          </div>
        </div>

        <div className="space-y-3 mb-5">
            {/* Personal Details */}
            {data?.personalDetails && (
              <motion.div variants={itemVariants} className="journey-panel p-4">
                <p className="journey-label mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1B739E]" /> Customer Details
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center border-b border-[#D5DCE3] pb-2">
                    <span className="journey-label">Name</span>
                    <span className="journey-value">{data.personalDetails.name}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-[#D5DCE3] pb-2">
                    <span className="journey-label">ID Number</span>
                    <span className="journey-value">{data.personalDetails.idNumber}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="journey-label">Phone</span>
                    <span className="journey-value">{data.personalDetails.phone}</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Finance Details */}
            {data?.financeSummary && (
              <motion.div variants={itemVariants} className="journey-panel p-4">
                <p className="journey-label mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FB8B23]" /> Finance Terms
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center border-b border-[#D5DCE3] pb-2">
                    <span className="journey-label">Amount</span>
                    <span className="journey-value">{data.financeSummary.amount?.toLocaleString("en-IN")} SAR</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-[#D5DCE3] pb-2">
                    <span className="journey-label">Tenure</span>
                    <span className="journey-value">{data.financeSummary.tenure} Months</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-[#D5DCE3] pb-2">
                    <span className="journey-label">Profit Rate</span>
                    <span className="journey-value">{data.financeSummary.profit_rate}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="journey-label">Monthly Installment</span>
                    <span className="journey-value">{data.financeSummary.monthly_installment?.toLocaleString("en-IN")} SAR</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Account Details */}
            {data?.account && (
              <motion.div variants={itemVariants} className="journey-panel p-4">
                <p className="journey-label mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1B739E]" /> Disbursement Account
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center border-b border-[#D5DCE3] pb-2">
                    <span className="journey-label">Bank</span>
                    <span className="journey-value">{data.account.bank}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-[#D5DCE3] pb-2">
                    <span className="journey-label">IBAN</span>
                    <span className="journey-value tabular-nums">{data.account.iban}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="journey-label">Beneficiary</span>
                    <span className="journey-value">{data.account.beneficiary}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          <motion.div variants={itemVariants} className="mb-6 flex items-start gap-3 journey-panel p-4">
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="checkbox"
                id="read-confirmed"
                checked={readConfirmed}
                onChange={(e) => setReadConfirmed(e.target.checked)}
                className="peer appearance-none w-5 h-5 border-2 border-[#D5DCE3] rounded-[6px] flex-shrink-0 checked:bg-[#1B739E] checked:border-[#1B739E] transition-colors cursor-pointer"
              />
              <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <label htmlFor="read-confirmed" className="journey-body cursor-pointer select-none">
              I have reviewed and confirmed all details are correct. I authorize the disbursement to proceed.
            </label>
          </motion.div>

          <motion.button
            variants={itemVariants}
            whileHover={readConfirmed ? { scale: 1.02 } : {}}
            whileTap={readConfirmed ? { scale: 0.98 } : {}}
            onClick={() => {
              if (readConfirmed) {
                window.dispatchEvent(
                  new CustomEvent("mock-send-message", {
                    detail: {
                      visibleText: "I confirm all details. Proceed for final verification.",
                      systemText: "__SYS__continue",
                    },
                  })
                );
              }
            }}
            disabled={!readConfirmed}
            className="w-full py-4 journey-widget-button text-[14px] shadow-lg transition-all duration-300"
          >
            Confirm & Proceed
          </motion.button>
        </div>
    </motion.div>
  );
}
