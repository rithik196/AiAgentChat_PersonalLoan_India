"use client";

import React from 'react';
import { motion } from 'framer-motion';

export function OtpVerificationWidget() {
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as [number, number, number, number], staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h3 className="journey-heading">Verification</h3>
            <p className="journey-label mt-1">Choose a method</p>
          </div>
        </div>

        <div className="journey-panel p-4 mb-5">
          <p className="journey-body text-center">
            Please select how you would like to securely verify your digital signature and complete your application.
          </p>
        </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                const event = new CustomEvent('mock-send-message', { detail: 'OTP Verification' });
                window.dispatchEvent(event);
              }}
              className="w-full relative group overflow-hidden py-4 journey-widget-button border border-transparent transition-all duration-300 shadow-lg flex items-center justify-center gap-3"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#FB8B23]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <svg className="w-5 h-5 text-[#1B739E]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-[14px] leading-[16px] font-semibold">SMS OTP</span>
            </motion.button>
            
            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                const event = new CustomEvent('mock-send-message', { detail: 'IVR Verification' });
                window.dispatchEvent(event);
              }}
              className="w-full relative group overflow-hidden py-4 journey-widget-button border border-transparent transition-all duration-300 shadow-lg flex items-center justify-center gap-3"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#FB8B23]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <svg className="w-5 h-5 text-[#FB8B23]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span className="text-[14px] leading-[16px] font-semibold">IVR Call</span>
            </motion.button>
          </div>
        </div>
    </motion.div>
  );
}
