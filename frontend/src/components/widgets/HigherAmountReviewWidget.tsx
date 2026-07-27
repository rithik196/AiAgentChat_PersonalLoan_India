"use client";

import React from "react";
import { Volume2 } from "lucide-react";
import { motion } from "framer-motion";
import { ImportantText } from "../shared/ImportantText";

export function HigherAmountReviewWidget() {
  const send = (visibleText: string, systemText: string) => {
    window.dispatchEvent(
      new CustomEvent("mock-send-message", {
        detail: {
          visibleText,
          systemText,
        },
      })
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-sm mt-3"
    >
      <div className="journey-surface p-4">
        <div className="journey-panel rounded-[16px] p-4">
          <p className="journey-body leading-relaxed">
            <ImportantText text="To proceed with your request for a higher finance amount, I will need to share your application and documents with our team for a personalized manual review." />
          </p>

          <p className="journey-body font-semibold leading-relaxed mt-5">
            <ImportantText text="Would you like to submit your application for review now?" />
          </p>

          <div className="h-px w-full bg-white/80 my-3" />
          <Volume2 size={17} className="text-[#43657A]" />
        </div>

        <div className="flex flex-col gap-2 mt-3">
          <button
            onClick={() => send("Submit for review", "__SYS__submit_higher_amount_review")}
            className="w-full py-3.5 journey-widget-button text-[14px] shadow-md hover:opacity-90 transition-all"
          >
            Submit for review
          </button>
          <button
            onClick={() => send("Go back", "__SYS__higher_amount_review_go_back")}
            className="w-full py-3.5 journey-widget-button text-[14px] shadow-md hover:opacity-90 transition-all"
          >
            Go back
          </button>
        </div>
      </div>
    </motion.div>
  );
}
