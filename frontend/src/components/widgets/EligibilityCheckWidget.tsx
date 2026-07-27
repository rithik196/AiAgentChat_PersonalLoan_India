"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ImportantText } from "../shared/ImportantText";

export function EligibilityCheckWidget() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDone(true);
      window.dispatchEvent(
        new CustomEvent("mock-send-message", { detail: "__SYS__eligibility_check_complete" })
      );
    }, 3500);

    return () => clearTimeout(timer);
  }, []);

  if (done) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-sm mt-3"
    >
      <div className="journey-surface p-5">
        <h3 className="journey-heading mb-2">Eligibility Check</h3>
        <p className="journey-body mb-3">
          <ImportantText text="We are running your eligibility and due diligence checks now." />
        </p>
        <div className="flex items-center gap-2 journey-label">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
            className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-700"
          />
          <ImportantText text="Verifying bureau records and eligibility rules..." />
        </div>
      </div>
    </motion.div>
  );
}
