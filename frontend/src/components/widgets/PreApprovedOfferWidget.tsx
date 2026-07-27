"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { ImportantText } from "../shared/ImportantText";

export interface PreApprovedOfferWidgetProps {
  data?: {
    title?: string;
    max_amount?: number;
    profit_rate?: string;
    max_tenure?: number;
    show_step_tracker?: boolean;
    tracker_step?: number;
    tracker_total?: number;
  };
}

export function PreApprovedOfferWidget({ data }: PreApprovedOfferWidgetProps) {
  const title = data?.title || 'Your Pre-Approved Offer';
  const maxAmount = data?.max_amount || 60000;
  const profitRate = data?.profit_rate || '6.1%';
  const maxTenure = data?.max_tenure || 60;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-sm mt-3"
    >
      <div className="journey-surface p-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
            <span className="text-blue-600 font-bold text-lg">$</span>
          </div>
          <h3 className="journey-heading">{title}</h3>
        </div>

        {/* ETB Pre-Approved Badge */}
        <div className="journey-panel border-l-4 border-emerald-500 p-3 mb-4">
          <p className="journey-label text-emerald-900">
            ✓ PRE-APPROVED
          </p>
          <p className="journey-body text-emerald-700 mt-1">
            <ImportantText text={`Pre-approved for ${maxAmount.toLocaleString('en-IN')} SAR at ${profitRate} profit rate`} />
          </p>
        </div>

        {/* Offer Details */}
        <div className="space-y-3 mb-4">
          <div>
            <p className="journey-label">Amount</p>
            <p className="journey-value mt-1">
              upto {maxAmount.toLocaleString('en-IN')} SAR
            </p>
          </div>
          <div>
            <p className="journey-label">Profit Rate</p>
            <p className="journey-value mt-1">{profitRate}</p>
          </div>
          <div>
            <p className="journey-label">Tenure</p>
            <p className="journey-value mt-1">upto {maxTenure} months</p>
          </div>
        </div>

        <p className="journey-label mb-5">
          <ImportantText text="You can go with this pre-approved offer right away, or if you need a higher amount, you can provide more details to check eligibility for a higher limit." />
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              const event = new CustomEvent('mock-send-message', {
                detail: {
                  visibleText: 'Go with offer',
                  systemText: '__SYS__accepted_pre_approved_offer',
                },
              });
              window.dispatchEvent(event);
            }}
            className="w-full py-3 journey-widget-button hover:opacity-90 transition-all"
          >
            Go with offer
          </button>
          
          <button
            onClick={() => {
              const event = new CustomEvent('mock-send-message', {
                detail: {
                  visibleText: 'I need higher amount',
                  systemText: '__SYS__higher_amount_requested',
                },
              });
              window.dispatchEvent(event);
            }}
            className="w-full py-3 journey-widget-button border-2 border-transparent shadow-sm hover:opacity-90 transition-all"
          >
            Need higher amount
          </button>
        </div>
      </div>
    </motion.div>
  );
}
