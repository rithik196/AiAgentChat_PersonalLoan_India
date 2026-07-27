"use client";

import React from "react";
import { Volume2 } from "lucide-react";
import { motion } from "framer-motion";
import { ImportantText } from "../shared/ImportantText";

interface BackofficeWorkitemWidgetProps {
  data?: {
    workitem?: {
      applicationId?: string | number;
    };
  };
}

function VoiceDivider() {
  return (
    <>
      <div className="h-px w-full bg-white/80 my-3" />
      <Volume2 size={17} className="text-[#43657A]" />
    </>
  );
}

export function BackofficeWorkitemWidget({ data }: BackofficeWorkitemWidgetProps) {
  const applicationId = data?.workitem?.applicationId || "------";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] }}
      className="w-full max-w-sm mt-4"
    >
      <div className="journey-surface p-4">
        <div className="flex flex-col gap-3">
          <div className="journey-panel rounded-[12px] p-4">
            <p className="journey-body leading-relaxed">
              <ImportantText text="I have successfully shared your request for a higher finance limit with our specialist team for a personalized review." />
            </p>
            <VoiceDivider />
          </div>

          <div className="journey-panel rounded-[12px] p-4">
            <p className="journey-body font-semibold">
              <ImportantText text={`Application ID: #${applicationId}`} />
            </p>
            <p className="journey-body leading-relaxed mt-4">
              <ImportantText text="Please save this reference number for your records; you can use it to track your application status." />
            </p>
            <p className="journey-body font-semibold leading-relaxed mt-4">
              <ImportantText text="One of our advisors will reach out to you shortly to discuss your requirements and guide you through the next steps." />
            </p>
            <VoiceDivider />
          </div>

          <div className="journey-panel rounded-[12px] p-4">
            <p className="journey-body leading-relaxed">
              <ImportantText text="Since your request is now with our dedicated team, my assistance for this journey is complete." />
            </p>
            <p className="journey-body font-semibold leading-relaxed mt-4">
              <ImportantText text="It has been a pleasure helping you today, we look forward to supporting your financial goals!" />
            </p>
            <VoiceDivider />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
