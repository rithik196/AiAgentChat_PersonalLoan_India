"use client";

import React from "react";
import { motion } from "framer-motion";
import { ImportantText } from "../shared/ImportantText";

interface WantsMoreDecisionWidgetProps {
  data?: {
    maxAmount?: number;
  };
}

export function WantsMoreDecisionWidget({ data }: WantsMoreDecisionWidgetProps) {
  const maxAmount = data?.maxAmount ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-sm mt-3"
    >
      <div className="journey-surface p-5">
        <h3 className="journey-heading mb-2">Amount Confirmation</h3>
        <p className="journey-body mb-1">
          <ImportantText text={`Your maximum eligible amount is ${maxAmount.toLocaleString("en-IN")} SAR.`} />
        </p>
        <p className="journey-body mb-4">
          <ImportantText text="Is this amount okay for you, or do you want more?" />
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("mock-send-message", {
                  detail: {
                    visibleText: "Proceed with the Amount",
                    systemText: "__SYS__accepted_max_offer",
                  },
                })
              );
            }}
            className="w-full py-3 journey-widget-button hover:opacity-90 transition-all"
          >
          Proceed
          </button>
          <button
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("mock-send-message", {
                  detail: {
                    visibleText: "I need a higher amount",
                    systemText: "__SYS__higher_amount_requested",
                  },
                })
              );
            }}
            className="w-full py-3 journey-widget-button border-2 border-transparent hover:opacity-90 transition-all"
          >
           Need Higher Amount
          </button>
        </div>
      </div>
    </motion.div>
  );
}
