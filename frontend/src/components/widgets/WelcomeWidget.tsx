"use client";

import React from 'react';
import { motion } from 'framer-motion';

interface WelcomeWidgetProps {
  data?: {
    categories?: string[];
  };
}

export function WelcomeWidget({ data }: WelcomeWidgetProps) {
  const categories = data?.categories || ['Cash Finance', 'Finance Type 2', 'Finance Type 3'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="w-full max-w-sm mt-2"
    >
      <div className="journey-surface p-8 text-center">
        <motion.h2
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-[16px] leading-[16px] font-semibold text-[#0D141A] mb-3"
        >
          Welcome!
        </motion.h2>
        <p className="journey-body mb-1">
          I am your personal finance assistant.
        </p>
        <p className="journey-body mb-6">
          Let&apos;s start your digital finance application.
        </p>
        <p className="journey-label mb-4">
          Choose a category to begin
        </p>
        <div className="flex flex-col gap-3">
          {categories.map((cat, idx) => (
            <motion.button
              key={cat}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + idx * 0.1 }}
              onClick={() => {
                const event = new CustomEvent('mock-send-message', { detail: cat });
                window.dispatchEvent(event);
              }}
              className="w-full py-3.5 px-6 journey-widget-button hover:opacity-90 transition-all hover:scale-[1.02] active:scale-95"
            >
              {cat}
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
