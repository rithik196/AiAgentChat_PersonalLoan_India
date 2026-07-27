"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Account {
  type: string;
  iban: string;
  bank: string;
  is_default?: boolean;
  beneficiary?: string;
}

interface AccountSelectorWidgetProps {
  data?: {
    accounts?: Account[];
    is_etb?: boolean;
    pre_select_default?: boolean;
    show_manual_entry?: boolean;
    show_step_tracker?: boolean;
    tracker_step?: number;
    tracker_total?: number;
  };
}

function getDefaultSelection(accounts: Account[], shouldPreselect?: boolean): number | null {
  if (accounts.length === 0) return null;

  if (shouldPreselect) {
    const defaultIndex = accounts.findIndex((account) => account.is_default);
    if (defaultIndex >= 0) return defaultIndex;
  }

  return null;
}

export function AccountSelectorWidget({ data }: AccountSelectorWidgetProps) {
  const incomingAccounts = data?.accounts || [];
  const [registeredAccounts] = useState<Account[]>(() => incomingAccounts);
  const accounts = registeredAccounts.length > 0 ? registeredAccounts : incomingAccounts;

  const defaultIndex = data?.pre_select_default ? accounts.findIndex(a => a.is_default) : -1;

  const [selected, setSelected] = useState<number | null>(() =>
    getDefaultSelection(incomingAccounts, data?.pre_select_default)
  );
  const [useManualEntry, setUseManualEntry] = useState(false);
  const [manualIBAN, setManualIBAN] = useState('');
  const effectiveSelected =
    selected !== null && selected >= 0 && selected < accounts.length
      ? selected
      : defaultIndex >= 0
        ? defaultIndex
        : null;

  const restoreRegisteredAccounts = () => {
    setUseManualEntry(false);
    setManualIBAN('');
    const restoredDefault = getDefaultSelection(accounts, data?.pre_select_default);
    setSelected(restoredDefault ?? (accounts.length > 0 ? 0 : null));
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as [number, number, number, number], staggerChildren: 0.1 }
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-sm mt-4 space-y-3"
    >
      <div className="journey-surface relative overflow-hidden p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#1B739E]/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#FB8B23]/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-white border border-[#D5DCE3] flex items-center justify-center shadow-sm">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[#1B739E]">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div>
              <h3 className="journey-heading">Disbursement Account</h3>
              <p className="journey-label mt-0.5">Where to send funds</p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {!useManualEntry ? (
              <motion.div
                key="list"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <div>
                  <p className="journey-label mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1B739E]" /> 
                    {data?.is_etb ? "Your Registered Accounts" : "Existing Accounts"}
                  </p>
                  <div className="space-y-2">
                    {accounts.length === 0 ? (
                      <div className="journey-panel p-4">
                        <p className="journey-label">
                          {data?.is_etb
                            ? "No registered accounts found. Please enter IBAN manually."
                            : "Add a new IBAN manually below"}
                        </p>
                      </div>
                    ) : (
                      accounts.map((account, idx) => (
                        <motion.button
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.25, delay: idx * 0.04 }}
                          onClick={() => setSelected(idx)}
                          data-account-option="true"
                          data-account-index={idx}
                          data-account-type={account.type}
                          data-account-iban={account.iban}
                          data-account-bank={account.bank}
                          data-account-beneficiary={account.beneficiary || ""}
                          data-account-last4={account.iban.replace(/\s/g, "").slice(-4)}
                          data-account-last6={account.iban.replace(/\s/g, "").slice(-6)}
                          data-account-selected={effectiveSelected === idx ? "true" : "false"}
                          className={`w-full text-left p-4 rounded-[16px] border transition-all duration-300 relative overflow-hidden ${
                            effectiveSelected === idx
                              ? 'border-[#1B739E] bg-white'
                              : 'border-[#D5DCE3] bg-white hover:border-[#1B739E]'
                          }`}
                        >
                          {effectiveSelected === idx && (
                            <div className="absolute inset-0 bg-gradient-to-r from-[#EBF4F5] to-transparent pointer-events-none" />
                          )}
                          <div className="flex items-start justify-between relative z-10">
                            <div>
                              <p className="journey-value">{account.type}</p>
                              <p className="journey-label mt-1 font-medium tabular-nums">{account.iban}</p>
                              <p className="text-[12px] text-[#425768] mt-1">{account.bank}</p>
                              {account.beneficiary && (
                                <p className="text-[12px] text-[#1B739E] mt-1 font-medium">{account.beneficiary}</p>
                              )}
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-1 transition-colors ${
                              effectiveSelected === idx ? 'border-[#1B739E]' : 'border-[#D5DCE3]'
                            }`}>
                              <motion.div
                                initial={false}
                                animate={{ scale: effectiveSelected === idx ? 1 : 0 }}
                                className="w-2.5 h-2.5 rounded-full bg-[#1B739E]"
                              />
                            </div>
                          </div>
                        </motion.button>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  <motion.button
                    whileHover={effectiveSelected !== null ? { scale: 1.02 } : {}}
                    whileTap={effectiveSelected !== null ? { scale: 0.98 } : {}}
                    onClick={() => {
                      if (effectiveSelected !== null) {
                        window.dispatchEvent(new CustomEvent('mock-send-message', {
                          detail: {
                            visibleText: 'Continue with Selected Account',
                            systemText: `ACCOUNT_SELECTED::${accounts[effectiveSelected].iban}`
                          }
                        }));
                      }
                    }}
                    disabled={effectiveSelected === null}
                    data-account-submit="true"
                    className="w-full py-4 journey-widget-button type-title-sm shadow-lg transition-all duration-300"
                  >
                    Use Selected Account
                  </motion.button>
                  <button
                    onClick={() => {
                      setManualIBAN('');
                      setUseManualEntry(true);
                    }}
                    data-account-manual-entry="true"
                    className="w-full py-4 journey-widget-button type-title-sm shadow-lg transition-all duration-300"
                  >
                    Or Enter IBAN manually
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="manual"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <div>
                  <p className="journey-label mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1B739E]" /> 
                    Manual IBAN Entry
                  </p>
                  <div className="journey-panel p-4 backdrop-blur-sm">
                    <input
                      type="text"
                      value={manualIBAN}
                      onChange={(e) => setManualIBAN(e.target.value.toUpperCase())}
                      placeholder="e.g., SA89 2980 0000 9090 5454 5001"
                      className="w-full bg-transparent border-b-2 border-[#D5DCE3] focus:border-[#1B739E] px-1 py-2 text-[14px] leading-[16px] font-semibold tabular-nums text-[#0D141A] placeholder:text-[#425768] outline-none transition-colors"
                    />
                    <p className="journey-label mt-2 flex justify-between">
                      <span>Format: SA + 22 digits</span>
                      <span className={manualIBAN.replace(/\s/g, '').length === 24 ? "text-[#1B739E]" : "text-[#425768]"}>
                        {manualIBAN.replace(/\s/g, '').length}/24 chars
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  <motion.button
                    whileHover={manualIBAN.replace(/\s/g, '').length >= 20 ? { scale: 1.02 } : {}}
                    whileTap={manualIBAN.replace(/\s/g, '').length >= 20 ? { scale: 0.98 } : {}}
                    onClick={() => {
                      if (manualIBAN.replace(/\s/g, '').length >= 20) {
                        window.dispatchEvent(new CustomEvent('mock-send-message', {
                          detail: {
                            visibleText: 'Validate IBAN',
                            systemText: `IBAN_ENTERED::${manualIBAN}`
                          }
                        }));
                      }
                    }}
                    disabled={manualIBAN.replace(/\s/g, '').length < 20}
                    data-account-validate="true"
                    className="w-full py-4 journey-widget-button type-title-sm shadow-lg transition-all duration-300"
                  >
                    Validate IBAN
                  </motion.button>
                  <button
                    onClick={restoreRegisteredAccounts}
                    data-account-back="true"
                    className="w-full py-4 journey-widget-button type-title-sm shadow-lg transition-all duration-300 bg-transparent text-[#1B739E] border border-[#1B739E] hover:bg-[#1B739E]/10"
                  >
                    Back to Existing Accounts
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
