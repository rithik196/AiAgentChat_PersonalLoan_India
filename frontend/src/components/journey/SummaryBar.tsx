"use client";

import React from 'react';

interface SummaryBarProps {
  loanAmount: number | null;
  emi: number | null;
  currency?: string;
}

export function SummaryBar({ loanAmount, emi, currency = "SAR" }: SummaryBarProps) {
  if (!loanAmount && !emi) return null;

  return (
    <div className="flex items-center justify-between p-4 bg-slate-900 text-white sticky bottom-0 z-10 shadow-lg">
      <div className="flex flex-col">
        <span className="text-xs text-slate-400 uppercase tracking-wider">Loan Amount</span>
        <span className="font-semibold">{loanAmount ? `${currency} ${loanAmount.toLocaleString()}` : '--'}</span>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-xs text-slate-400 uppercase tracking-wider">Monthly EMI</span>
        <span className="font-semibold text-green-400">{emi ? `${currency} ${emi.toLocaleString()}` : '--'}</span>
      </div>
    </div>
  );
}
