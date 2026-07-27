"use client";


import React from "react";
import { motion } from "framer-motion";

export function GenerateContractWidget() {
  const handleAction = () => {
    window.dispatchEvent(
      new CustomEvent("mock-send-message", {
        detail: {
          visibleText: "Generate the Contract & Promissory Note",
          systemText: "__SYS__proceed_esign",
        },
      })
    );
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] } },
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="w-full max-w-sm mt-4">
      <div className="journey-surface p-6">
        <div className="mb-5">
          <p className="journey-body mb-4 font-semibold">
            To finalise your Cash Finance agreement, you are required to review and digitally sign the following two documents:
          </p>
          <ol className="list-decimal pl-5 journey-body font-semibold space-y-2 mb-2 ">
            <li>Contract Letter</li>
            <li>Promissory Note</li>
          </ol>
        </div>

        <button
          onClick={handleAction}
          className="w-full py-3.5 journey-widget-button text-[14px] shadow-lg transition-all duration-300"
        >
          Generate Contract & Promissory Note
        </button>
      </div>
    </motion.div>
  );
}
