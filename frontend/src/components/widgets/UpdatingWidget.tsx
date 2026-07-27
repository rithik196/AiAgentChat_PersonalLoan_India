"use client";

import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";

export interface UpdatingWidgetProps {
  data?: {
    section: string;       // e.g. "Personal details", "Income details"
    auto_advance_ms?: number;
    next_message?: string;
    silent?: boolean;
  };
}

export function UpdatingWidget({ data }: UpdatingWidgetProps) {
  if (!data) return null;
  const { section, auto_advance_ms = 3000, next_message, silent } = data;
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [isVisible, setIsVisible] = React.useState(true);

  useEffect(() => {
    // Ensure any previous timer is cleared
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Set up new timer - ALWAYS fires after auto_advance_ms
    timerRef.current = setTimeout(() => {
      const msg = next_message || "update_complete";
      const detailMsg = silent ? `__SYS__${msg}` : msg;
      console.log(`[UpdatingWidget] Auto-advancing after ${auto_advance_ms}ms with message:`, detailMsg);
      
      const event = new CustomEvent("mock-send-message", {
        detail: detailMsg,
      });
      window.dispatchEvent(event);
      setIsVisible(false); // Hide the popup once it advances
      timerRef.current = null;
    }, auto_advance_ms);

    // Cleanup on unmount or data change
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [auto_advance_ms, next_message, silent]);

  if (!isVisible) return null;

  return (
    // Full-screen overlay with blur — sits on top of everything
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(15, 23, 42, 0.55)", backdropFilter: "blur(8px)" }}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="journey-panel p-8 flex flex-col items-center gap-5 max-w-xs w-full mx-4"
      >
        {/* Spinner */}
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-blue-500">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
              <path d="M12 4v4m0 8v4M4 12h4m8 0h4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Text */}
        <div className="text-center">
          <h3 className="journey-heading mb-1">Updating Details...</h3>
          <p className="journey-body text-[#425768]">
            {section} {section.endsWith("details") ? "are" : "is"} getting updated with new data
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-white rounded-full h-1 overflow-hidden border border-[#D5DCE3]">
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: (auto_advance_ms || 3000) / 1000, ease: "linear" }}
            className="h-full rounded-full"
            style={{ background: "linear-gradient(261.63deg, #C24231 9.51%, #FB8B23 87.57%)" }}
          />
        </div>
        
        {/* Optional: Show elapsed time for debugging */}
        <div className="journey-label">
          Auto-advancing in {(auto_advance_ms || 3000) / 1000}s...
        </div>
      </motion.div>
    </motion.div>
  );
}
