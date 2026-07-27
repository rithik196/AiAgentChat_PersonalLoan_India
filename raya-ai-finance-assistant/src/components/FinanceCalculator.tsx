/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Scale, Sparkles, Check, Info, ShieldAlert } from 'lucide-react';

interface FinanceCalculatorProps {
  amount: number;
  tenure: number;
  financeType: 'islamic' | 'conventional' | null;
  onChangeAmount: (val: number) => void;
  onChangeTenure: (val: number) => void;
  onChangeType: (type: 'islamic' | 'conventional') => void;
  onSync: () => void;
}

export default function FinanceCalculator({
  amount,
  tenure,
  financeType,
  onChangeAmount,
  onChangeTenure,
  onChangeType,
  onSync,
}: FinanceCalculatorProps) {
  // Constants for standard Saudi retail profit rates
  const FIXED_PROFIT_RATE_APR = 3.25; // 3.25% fixed flat per annum

  // Calculate finance metrics
  // Total profit charge = Principal * Rate * (Tenure in Years) / 100
  const totalYears = tenure / 12;
  const totalProfitCharge = Math.round(amount * (FIXED_PROFIT_RATE_APR / 100) * totalYears);
  const totalRepayAmount = amount + totalProfitCharge;
  const monthlyInstallment = Math.round(totalRepayAmount / tenure);

  return (
    <div className="bg-white/60 backdrop-blur-md border border-white/40 rounded-3xl p-4 sm:p-5 shadow-md relative overflow-hidden text-left">
      {/* Decorative premium badge */}
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-[#DDF1FC]/80 text-[#1F6FB2] text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
        <Sparkles className="w-2.5 h-2.5" /> Calculator
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-[#DDF1FC] flex items-center justify-center text-[#1F6FB2]">
          <Scale className="w-4 h-4" />
        </div>
        <h4 className="text-sm font-bold text-slate-800">Finance Estimation</h4>
      </div>

      {/* Mode Switches */}
      <div className="grid grid-cols-2 gap-2 mb-4 bg-slate-100 p-1 rounded-xl">
        <button
          type="button"
          onClick={() => onChangeType('islamic')}
          className={`py-2 px-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
            financeType === 'islamic'
              ? 'bg-[#1F6FB2] text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {financeType === 'islamic' && <Check className="w-3 h-3" />}
          <span>Islamic (Tawarruq)</span>
        </button>
        <button
          type="button"
          onClick={() => onChangeType('conventional')}
          className={`py-2 px-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
            financeType === 'conventional'
              ? 'bg-[#1F6FB2] text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {financeType === 'conventional' && <Check className="w-3 h-3" />}
          <span>Conventional</span>
        </button>
      </div>

      {/* Sliders Container */}
      <div className="space-y-4">
        {/* Loan Amount Slider */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-semibold text-slate-500">Finance Amount</span>
            <span className="text-base font-extrabold text-[#1F6FB2]">
              SAR {amount.toLocaleString()}
            </span>
          </div>
          <input
            type="range"
            min="50000"
            max="500000"
            step="10000"
            value={amount}
            onChange={(e) => onChangeAmount(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1F6FB2] focus:outline-hidden"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-semibold mt-1">
            <span>SAR 50k</span>
            <span>SAR 250k</span>
            <span>SAR 500k</span>
          </div>
        </div>

        {/* Repayment Tenure Slider */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-semibold text-[#5c6873]">Tenure Period</span>
            <span className="text-base font-extrabold text-[#1F6FB2]">
              {tenure} Months <span className="text-xs font-medium text-slate-400">({totalYears} yrs)</span>
            </span>
          </div>
          <input
            type="range"
            min="12"
            max="60"
            step="12"
            value={tenure}
            onChange={(e) => onChangeTenure(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1F6FB2] focus:outline-hidden"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-semibold mt-1">
            <span>12 Months</span>
            <span>36 Months</span>
            <span>60 Months</span>
          </div>
        </div>
      </div>

      {/* Metrics Calculations Card */}
      <div className="mt-5 bg-[#DDF1FC]/30 border border-[#DDF1FC]/70 rounded-2xl p-4 space-y-2.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-500 font-medium">Profit Rate (Fixed p.a.)</span>
          <span className="font-bold text-[#1F6FB2]">{FIXED_PROFIT_RATE_APR}% APR</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-500 font-medium">Total Profit Charge</span>
          <span className="font-bold text-slate-700">SAR {totalProfitCharge.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-500 font-medium">Total Repayment</span>
          <span className="font-bold text-slate-700">SAR {totalRepayAmount.toLocaleString()}</span>
        </div>

        <div className="border-t border-[#DDF1FC] pt-3 flex justify-between items-baseline">
          <span className="text-xs font-bold text-slate-700">Monthly Installment</span>
          <span className="text-xl font-black text-[#1F6FB2]">
            SAR {monthlyInstallment.toLocaleString()}
            <span className="text-[10px] font-normal text-slate-400">/mo</span>
          </span>
        </div>
      </div>

      {/* Regulatory/SAMA Disclosure */}
      <div className="mt-3.5 flex items-start gap-1.5 text-[10px] text-slate-400 leading-normal">
        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
        <p>
          Calculations are illustrative under a 3.25% flat APR. Financial terms may adjust depending on your credit bureau (Simah) profile score.
        </p>
      </div>

      {/* Shariah or Commercial Badge */}
      <div className="mt-4 flex justify-between items-center border-t border-slate-100 pt-3">
        {financeType === 'islamic' ? (
          <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-bold">
            <Check className="w-3.5 h-3.5" />
            <span>Islamic Board Certified (Murabaha/Tawarruq)</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-sky-50 text-[#1F6FB2] px-2 py-1 rounded-lg text-[10px] font-bold">
            <Info className="w-3.5 h-3.5" />
            <span>Conventional Corporate Finance</span>
          </div>
        )}

        {/* Sync Action CTA */}
        <button
          type="button"
          onClick={onSync}
          className="bg-[#1F6FB2] text-white hover:bg-[#1F6FB2]/90 hover:scale-102 font-bold text-xs py-2 px-3 rounded-lg flex items-center gap-1 transition-all shadow-xs"
        >
          <span>Apply This Offer</span>
        </button>
      </div>
    </div>
  );
}
