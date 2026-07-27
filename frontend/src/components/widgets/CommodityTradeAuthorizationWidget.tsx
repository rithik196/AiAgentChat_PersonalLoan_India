"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";

interface CommodityTradeAuthorizationWidgetProps {
  data?: {
    show_step_tracker?: boolean;
    tracker_step?: number;
    tracker_total?: number;
  };
}

export function CommodityTradeAuthorizationWidget({ data }: CommodityTradeAuthorizationWidgetProps) {
  void data;
  const [authorized, setAuthorized] = useState(false);

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
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
              <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h3 className="journey-heading">Commodity Trade</h3>
            <p className="journey-label mt-1">Authorization Required</p>
          </div>
        </div>

        <div className="journey-panel p-4 mb-5">
          <div className="flex items-start gap-3">
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="checkbox"
                id="trade-auth"
                checked={authorized}
                onChange={(e) => setAuthorized(e.target.checked)}
                className="peer appearance-none w-5 h-5 border-2 border-[#D5DCE3] rounded-[6px] flex-shrink-0 checked:bg-[#1B739E] checked:border-[#1B739E] transition-colors cursor-pointer"
              />
              <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <label htmlFor="trade-auth" className="journey-body cursor-pointer select-none">
              I authorize the bank to complete the commodity trade required for my finance plan.
            </label>
          </div>
        </div>

          <motion.button
            whileHover={authorized ? { scale: 1.02 } : {}}
            whileTap={authorized ? { scale: 0.98 } : {}}
            onClick={() => {
              if (authorized) {
                window.dispatchEvent(
                  new CustomEvent("mock-send-message", {
                    detail: {
                      visibleText: "I authorize the commodity trade.",
                      systemText: "__SYS__continue",
                    },
                  })
                );
              }
            }}
            disabled={!authorized}
            className="w-full py-4 journey-widget-button text-[14px] shadow-lg transition-all duration-300"
          >
            Authorize Trade
          </motion.button>
        </div>
    </motion.div>
  );
}
