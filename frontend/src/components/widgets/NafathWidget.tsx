"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ImportantText } from "../shared/ImportantText";

interface NafathWidgetProps {
  data?: {
    nafath_code?: number;
  };
}

export function NafathWidget({ data }: NafathWidgetProps) {
  const code = data?.nafath_code ?? 42;
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDone(true);
      const event = new CustomEvent("mock-send-message", { detail: "__SYS__Nafath Approved" });
      window.dispatchEvent(event);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  if (done) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-sm mt-3"
    >
      <div className="journey-surface p-6">
        <p className="journey-body mb-1">
          <ImportantText text="I've sent a request to your Nafath app to securely verify your identity." />
        </p>
        <p className="journey-body font-semibold mb-4">
          <ImportantText text="Please open Nafath app and select the number displayed below to continue." />
        </p>

        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
          className="text-5xl font-bold text-[#0D141A] mb-5"
        >
          {code}
        </motion.div>

        <div className="flex items-center gap-2 journey-label">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 5, ease: "linear" }}
            className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-600"
          />
          <ImportantText text="Waiting for Nafath approval..." />
        </div>

        <button
          onClick={() => {
            const event = new CustomEvent("mock-send-message", { detail: "Did not receive the request" });
            window.dispatchEvent(event);
          }}
          className="mt-4 w-full py-3 journey-widget-button border-2 border-transparent hover:opacity-90 transition-all"
        >
          Did not receive the request
        </button>
      </div>
    </motion.div>
  );
}
