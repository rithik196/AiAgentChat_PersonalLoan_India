"use client";

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ImportantText } from "../shared/ImportantText";

interface VerificationSuccessWidgetProps {
  data?: {
    title?: string;
    subtitle?: string;
    auto_advance_ms?: number;
    next_message?: string;
    /** If true, auto-fires silently (no chat bubble). If false/absent, shows Continue button. */
    silent?: boolean;
  };
}

export function VerificationSuccessWidget({ data }: VerificationSuccessWidgetProps) {
  const title = data?.title || 'Verification Successful';
  const subtitle = data?.subtitle || 'Your details have been fetched successfully.';
  const autoAdvanceMs = data?.auto_advance_ms || 3000;
  const nextMessage = data?.next_message || 'continue';
  const silent = data?.silent ?? false;
  const [done, setDone] = useState(false);
  const [readyToContinue, setReadyToContinue] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (silent) {
        setDone(true);
        const event = new CustomEvent('mock-send-message', { detail: `__SYS__${nextMessage}` });
        window.dispatchEvent(event);
      } else {
        setReadyToContinue(true);
      }
    }, autoAdvanceMs);
    return () => clearTimeout(timer);
  }, [autoAdvanceMs, nextMessage, silent]);

  const handleContinue = () => {
    const event = new CustomEvent('mock-send-message', { detail: nextMessage });
    window.dispatchEvent(event);
  };

  if (done) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full max-w-sm mt-3"
    >
      <div className="journey-surface p-10 text-center">
        {/* Green Checkmark Circle */}
        <div className="w-20 h-20 mx-auto mb-5 relative">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
            className="w-full h-full rounded-full flex items-center justify-center bg-white"
            style={{
              border: '4px solid #1B739E',
            }}
          >
            <motion.svg
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.4, ease: 'easeOut' }}
              className="w-10 h-10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#1B739E"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <motion.path
                d="M5 13l4 4L19 7"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.5, duration: 0.4 }}
              />
            </motion.svg>
          </motion.div>
        </div>

        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="journey-heading mb-2"
        >
          {title}
        </motion.h3>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="journey-body text-[#425768]"
        >
          <ImportantText text={subtitle} />
        </motion.p>

        {!silent && readyToContinue && (
          <button
            onClick={handleContinue}
            className="mt-5 px-5 py-2.5 journey-widget-button shadow-md hover:opacity-90 transition-all"
          >
            Continue
          </button>
        )}
      </div>
    </motion.div>
  );
}
