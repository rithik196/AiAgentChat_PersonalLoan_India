"use client";

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ImportantText } from "../shared/ImportantText";

interface LoadingWidgetProps {
  data?: {
    title?: string;
    subtitle?: string;
    auto_advance_ms?: number;
    next_message?: string;
    /** If true, auto-fires silently (no chat bubble). If false/absent, shows Continue button. */
    silent?: boolean;
  };
}

export function LoadingWidget({ data }: LoadingWidgetProps) {
  const title = data?.title || 'Verifying OTP...';
  const subtitle = data?.subtitle || 'Processing your secure request';
  const autoAdvanceMs = data?.auto_advance_ms || 3000;
  const nextMessage = data?.next_message || 'done';
  const silent = data?.silent ?? false;
  const [completed, setCompleted] = useState(false);
  const [readyToContinue, setReadyToContinue] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (silent) {
        // Auto-advance internally — no user bubble
        setCompleted(true);
        const event = new CustomEvent('mock-send-message', { detail: `__SYS__${nextMessage}` });
        window.dispatchEvent(event);
      } else {
        setReadyToContinue(true);
      }
    }, autoAdvanceMs);
    return () => clearTimeout(timer);
  }, [autoAdvanceMs, nextMessage, silent]);

  const handleContinue = () => {
    setCompleted(true);
    const event = new CustomEvent('mock-send-message', { detail: nextMessage });
    window.dispatchEvent(event);
  };

  if (completed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-sm mt-3"
    >
      <div
        className="rounded-3xl p-10 text-center shadow-sm"
        style={{
          background: 'linear-gradient(180deg, #EBF4F5 0%, #D4E8EF 100%)',
        }}
      >
        {/* Spinner */}
        <div className="w-24 h-24 mx-auto mb-6 relative">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
            className="absolute inset-0 rounded-full"
            style={{
              border: '5px solid #D1D5DB',
              borderTopColor: '#374151',
            }}
          />
        </div>

        <h3 className="journey-heading mb-2">{title}</h3>
        <p className="journey-body text-[#425768]"><ImportantText text={subtitle} /></p>

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
