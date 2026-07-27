"use client";

import React from "react";
import { motion } from "framer-motion";
import { ImportantText } from "../shared/ImportantText";

interface DisbursementWidgetProps {
  data?: {
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
}

export function DisbursementWidget({ data }: DisbursementWidgetProps) {
  const customerName = data?.customer_name || "Customer";
  const reference = data?.reference || "PF-2025-XXXXXXXX";
  const date = data?.date || "03 April 2025";
  const amount = data?.amount || 0;
  const account = data?.account || "Current Account ****1234";
  const tenure = data?.tenure || "0 Months";
  const profitRate = data?.profit_rate || "";
  const firstInstallment = data?.first_installment || "03 July 2025";
  const monthlyInstallment = data?.monthly_installment || 0;
  const totalPayable = data?.total_payable || 0;
  const bank = data?.bank || "";
  const beneficiary = data?.beneficiary || "";
  const maskedAccount = (() => {
    if (!account) return "Current Account ****1234";
    if (account.includes("****")) return account;
    const compact = account.replace(/\s+/g, "");
    if (compact.length <= 4) return account;
    return `****${compact.slice(-4)}`;
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-sm mt-3 space-y-4"
    >
      <div 
        className="px-5 py-3.5 rounded-[16px] rounded-bl-none shadow-sm type-body-md-strong text-[14px] leading-relaxed text-slate-900"
        style={{ backgroundImage: "linear-gradient(90deg, #EBF4F5 0%, #B9DCF2 100%)" }}
      >
        <p className="font-bold text-[15px]">Congratulations, {customerName}!</p>
        <p className="mt-1">
          Your Personal Finance has been successfully disbursed. Here are your complete details for your records
        </p>
      </div>

      <div className="journey-panel p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-white border border-[#D5DCE3] flex items-center justify-center shadow-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[#1B739E]">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="journey-heading">Cash Finance Details</h3>
        </div>

        <div className="space-y-3">
          <div>
            <p className="journey-label">Reference Number</p>
            <p className="journey-value">{reference}</p>
          </div>
          <div>
            <p className="journey-label">Disbursement Date</p>
            <p className="journey-value">{date}</p>
          </div>
          <div>
            <p className="journey-label">Finance Amount</p>
            <p className="journey-value">SAR {amount.toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="journey-label">Disbursed To</p>
            <p className="journey-value">{maskedAccount}</p>
          </div>
          {bank && (
            <div>
              <p className="journey-label">Bank</p>
              <p className="journey-value">{bank}</p>
            </div>
          )}
          {beneficiary && (
            <div>
              <p className="journey-label">Beneficiary</p>
              <p className="journey-value">{beneficiary}</p>
            </div>
          )}
          <div>
            <p className="journey-label">Repayment Period</p>
            <p className="journey-value">{tenure}</p>
          </div>
          <div>
            <p className="journey-label">Annual Profit Rate</p>
            <p className="journey-value">{profitRate}</p>
          </div>
          <div>
            <p className="journey-label">First Instalment Due</p>
            <p className="journey-value">{firstInstallment}</p>
          </div>
          <div>
            <p className="journey-label">Monthly Installment</p>
            <p className="journey-value">SAR {monthlyInstallment.toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="journey-label">Total Amount Payable</p>
            <p className="journey-value">SAR {totalPayable.toLocaleString("en-IN")}</p>
          </div>
        </div>
      </div>

      <div 
        className="px-5 py-3.5 rounded-[16px] rounded-bl-none shadow-sm type-body-md-strong text-[14px] leading-relaxed text-slate-900"
        style={{ backgroundImage: "linear-gradient(90deg, #EBF4F5 0%, #B9DCF2 100%)" }}
      >
        <h3 className="font-bold text-[15px]">Congratulations! Your Cash Finance has been successfully disbursed.</h3>
        <p>Your Welcome Letter and repayment schedule have been sent to your registered email address and are also available in the app under <b> My Finance {">"} Active Agreements.</b></p>
        <p className="mt-4">You can view your finance details, track repayments, download documents, and manage your agreement anytime through the app.</p>
      </div>

      <div 
        className="px-5 py-3.5 rounded-[16px] rounded-bl-none shadow-sm type-body-md-strong text-[14px] leading-relaxed text-slate-900"
        style={{ backgroundImage: "linear-gradient(90deg, #EBF4F5 0%, #B9DCF2 100%)" }}
      >
        <p>It has been a genuine pleasure assisting you today, {customerName}. We wish you every success with your plans, and we look forward to continuing to be of service.</p>
        <p className="mt-4 font-semibold">Our team is available 24 hours a day, 7 days a week should you need any assistance, simply call 022-1234-5678 or return to this assistant at any time.</p>
        <p className="mt-4">Thank you sincerely for choosing Newgen Bank".</p>
      </div>
    </motion.div>
  );
}
