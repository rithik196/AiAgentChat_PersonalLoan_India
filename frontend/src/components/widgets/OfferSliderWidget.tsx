"use client";

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { VOICE_WIDGET_FIELD_UPDATE_EVENT, type VoiceWidgetFieldUpdate } from "@/lib/voiceWidgetFields";

interface OfferSliderWidgetProps {
  data?: {
    max_amount?: number;
    min_amount?: number;
    profit_rate?: string;
    default_tenure?: number;
    default_amount?: number | null;
    is_preapproved_path?: boolean;
  };
}

const TENURE_OPTIONS = [12, 24, 36, 48, 60];

export function OfferSliderWidget({ data, messageId }: OfferSliderWidgetProps & { messageId?: string }) {
  const maxAmount = data?.max_amount || 250000;
  const minAmount = data?.min_amount || 5000;
  const profitRateStr = data?.profit_rate || '6.1%';
  const profitRate = parseFloat(profitRateStr) / 100;
  const defaultTenure = data?.default_tenure || 36;
  const defaultAmount = Math.min(
    maxAmount,
    Math.max(minAmount, data?.default_amount ?? Math.round(maxAmount * 0.6))
  );

  const [amount, setAmount] = useState(defaultAmount);
  const [amountInputStr, setAmountInputStr] = useState(String(defaultAmount));
  const [tenure, setTenure] = useState(defaultTenure);
  const [showTenureDropdown, setShowTenureDropdown] = useState(false);

  React.useEffect(() => {
    const handleVoiceUpdate = (event: Event) => {
      const detail = (event as CustomEvent<VoiceWidgetFieldUpdate>).detail;
      if (!detail || detail.widget !== "OfferSliderWidget" || detail.messageId !== messageId) return;

      if (typeof detail.updates.amount === "number") {
        const clamped = Math.min(maxAmount, Math.max(minAmount, detail.updates.amount));
        setAmount(clamped);
        setAmountInputStr(String(clamped));
      }
      if (typeof detail.updates.tenure === "number") {
        const targetTenure = detail.updates.tenure;
        const closestTenure = TENURE_OPTIONS.reduce((best, option) =>
          Math.abs(option - targetTenure) < Math.abs(best - targetTenure) ? option : best
        );
        setTenure(closestTenure);
        setShowTenureDropdown(false);
      }
    };

    window.addEventListener(VOICE_WIDGET_FIELD_UPDATE_EVENT, handleVoiceUpdate);
    return () => window.removeEventListener(VOICE_WIDGET_FIELD_UPDATE_EVENT, handleVoiceUpdate);
  }, [maxAmount, messageId, minAmount]);

  const monthlyInstallment = useMemo(() => {
    const monthlyRate = profitRate / 12;
    if (monthlyRate === 0) return amount / tenure;
    const emi = (amount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / (Math.pow(1 + monthlyRate, tenure) - 1);
    return Math.round(emi);
  }, [amount, tenure, profitRate]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] }}
      className="w-full max-w-sm mt-4"
    >
      <div className="relative overflow-hidden rounded-[16px] bg-white border border-[#D5DCE3] shadow-2xl shadow-blue-900/5">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#1B6A8A] via-[#4BA3C7] to-[#1B6A8A]" />
        
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center border border-blue-200">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-blue-600">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <h3 className="journey-heading">Customize Finance</h3>
              <p className="journey-label">Adjust your plan</p>
            </div>
          </div>

          {/* Amount Slider */}
          <div className="journey-panel p-4 mb-7">
            <div className="flex justify-between items-end mb-4">
              <p className="journey-label">Amount (SAR)</p>
              <div className="text-right">
                <input
                  type="text"
                  inputMode="numeric"
                  value={amountInputStr}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setAmountInputStr(raw);
                  }}
                  onBlur={() => {
                    const parsed = Number(amountInputStr);
                    const clamped = Number.isNaN(parsed) || parsed === 0
                      ? minAmount
                      : Math.min(maxAmount, Math.max(minAmount, parsed));
                    setAmount(clamped);
                    setAmountInputStr(String(clamped));
                  }}
                  className="w-36 bg-transparent text-right text-2xl font-black text-[#1B6A8A] focus:outline-none"
                />
                <span className="journey-label ml-1">SAR</span>
              </div>
            </div>
            <input
              type="range"
              min={minAmount}
              max={maxAmount}
              step={1}
              value={amount}
              onChange={(e) => {
                const val = Number(e.target.value);
                setAmount(val);
                setAmountInputStr(String(val));
              }}
              className="journey-range w-full h-1 rounded-full appearance-none cursor-pointer focus:outline-none"
              style={{
                backgroundColor: "#FFFFFF",
                backgroundImage: "linear-gradient(261.63deg, #C24231 9.51%, #FB8B23 87.57%)",
                backgroundRepeat: "no-repeat",
                backgroundSize: `${((amount - minAmount) / (maxAmount - minAmount)) * 100}% 100%`,
                backgroundPosition: "left center",
              }}
            />
            <div className="flex justify-between journey-label mt-2">
              <span>{minAmount.toLocaleString()}</span>
              <span>{maxAmount.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Tenure Slider */}
          <div className="journey-panel p-4 mb-6 relative">
            <div className="flex justify-between items-end mb-4">
              <p className="journey-label">Tenure (Months)</p>
              
              <div className="relative">
                <button
                  onClick={() => setShowTenureDropdown(!showTenureDropdown)}
                  className="flex items-center gap-1 bg-white border border-[#D5DCE3] px-3 py-1.5 rounded-[16px] hover:border-blue-300 transition-colors"
                >
                  <span className="journey-value text-[#1B6A8A]">{tenure} Mo</span>
                  <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showTenureDropdown && (
                  <div className="absolute top-full right-0 mt-1 bg-white border border-[#D5DCE3] rounded-[16px] shadow-xl z-20 overflow-hidden w-32 py-1">
                    {TENURE_OPTIONS.map((t) => (
                      <button
                        key={t}
                        onClick={() => { setTenure(t); setShowTenureDropdown(false); }}
                        className={`block w-full text-left px-4 py-2 text-[12px] transition-colors hover:bg-slate-50 ${t === tenure ? 'font-semibold text-[#1B6A8A] bg-blue-50/50' : 'text-[#425768] font-normal'}`}
                      >
                        {t} Months
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <input
              type="range"
              min={12}
              max={60}
              step={12}
              value={tenure}
              onChange={(e) => setTenure(Number(e.target.value))}
              className="journey-range w-full h-1 rounded-full appearance-none cursor-pointer focus:outline-none"
              style={{
                backgroundColor: "#FFFFFF",
                backgroundImage: "linear-gradient(261.63deg, #C24231 9.51%, #FB8B23 87.57%)",
                backgroundRepeat: "no-repeat",
                backgroundSize: `${((tenure - 12) / (60 - 12)) * 100}% 100%`,
                backgroundPosition: "left center",
              }}
            />
            <div className="flex justify-between journey-label mt-2">
              <span>12</span>
              <span>60</span>
            </div>
          </div>

          {/* Details & Actions */}
          <div className="flex justify-between items-center bg-[#1B6A8A] rounded-[16px] p-4 mb-5 text-white shadow-lg shadow-[#1B6A8A]/30">
            <div>
              <p className="text-[12px] leading-none font-normal text-blue-100 mb-1">Profit Rate</p>
              <p className="text-[14px] leading-[16px] font-semibold">{profitRateStr}</p>
            </div>
            <div className="w-px h-8 bg-blue-400/30" />
            <div className="text-right">
              <p className="text-[12px] leading-none font-normal text-blue-100 mb-1">EMI</p>
              <div className="flex items-baseline gap-1">
                <p className="text-[14px] leading-[16px] font-semibold">{monthlyInstallment.toLocaleString('en-IN')}</p>
                <span className="text-[12px] leading-none font-normal text-blue-200">SAR/mo</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('mock-send-message', {
                  detail: {
                    visibleText: 'I confirm this finance plan',
                    systemText: `__SYS__CONFIRM_FINANCE_PLAN: ${JSON.stringify({
                      amount,
                      tenure,
                      profitRate: profitRateStr,
                      monthlyInstallment,
                    })}`,
                  },
                }));
              }}
              className="w-full py-3.5 journey-widget-button text-[14px] shadow-md hover:opacity-90 transition-all duration-300"
            >
              Confirm Finance Plan
            </motion.button>
            {/* <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('mock-send-message', { detail: 'Request for a higher amount' }));
              }}
              className="w-full py-3 journey-widget-button border border-transparent text-[14px] hover:opacity-90 transition-all duration-300"
            >
              Request higher amount
            </motion.button> */}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
