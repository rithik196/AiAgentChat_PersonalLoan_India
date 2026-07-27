"use client";

import React from 'react';
import { motion } from 'framer-motion';
const steps = [
  { id: 1, label: "Identity Verification" },
  { id: 2, label: "Personalized Offer" },
  { id: 3, label: "Commodity Trade" },
  { id: 4, label: "Digital Signature" },
  { id: 5, label: "Account Selection and Disbursement" }
];

export function NTBIntroductionWidget() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] }}
      className="w-full max-w-sm mt-3"
    >
      <div className="journey-surface relative overflow-hidden p-6">
        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h3 className="journey-heading mb-2">
              Journey Overview
            </h3>
            <p className="journey-body mb-6 text-[#425768]">
              We'll guide you through a simple 5-step process to get your funds ready.
            </p>
          </motion.div>

          <div className="space-y-3 mb-8">
            {steps.map((step, idx) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + idx * 0.1 }}
                className="journey-panel p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="journey-step-circle">
                    {step.id}
                  </span>
                  {/* <span className="journey-value align-middle">
                    -- Step {step.id}/5
                  </span> */}
               
                <span className="mt-1.5 block journey-body">
                  {step.label}
                </span>
               </div>
              </motion.div>
              
            ))}
          </div>

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            onClick={() => {
              const event = new CustomEvent('mock-send-message', {
                detail: {
                  visibleText: "Let's begin",
                  systemText: "__SYS__continue",
                },
            });
              window.dispatchEvent(event);
            }}
            className="w-full py-3.5 journey-widget-button text-[14px] shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:scale-[1.02] transition-all duration-300 active:scale-95"
          >
            Let's Begin
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
