import React from 'react';
import { motion } from 'framer-motion';
import { ImportantText } from "../shared/ImportantText";

export function SuccessWidget({ data }: { data?: any }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-sm mt-4 journey-surface p-6 text-center"
    >
      <div className="w-20 h-20 bg-green-500 rounded-full mx-auto flex items-center justify-center mb-4 shadow-md">
        <motion.svg 
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-10 h-10 text-white" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor" 
          strokeWidth="3"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </motion.svg>
      </div>
      <h3 className="journey-heading mb-1">Disbursement Initiated!</h3>
      <p className="journey-body mb-4">
        <ImportantText text="Your funds will be transferred to your account within 1 business day." />
      </p>
      <div className="journey-panel p-4 text-left">
         <div className="journey-label mb-1">Status</div>
         <div className="text-[14px] leading-[16px] font-semibold text-green-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Processing Transfer
         </div>
      </div>
    </motion.div>
  );
}
