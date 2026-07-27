"use client";

import React from "react";
import { motion } from "framer-motion";

export function ModifySectionWidget() {
  const sections = [
    { value: "personal", label: "Personal Details", desc: "Email Id,Education, Marital Status, Dependents" },
    { value: "address", label: "Address Details", desc: "Modify Address or Add a New One" },
    { value: "employment", label: "Employment Details", desc: "Update Employment Information" },
    { value: "income", label: "Income Details", desc: "Monthly Income, Proof of Income" }
  ];

  const handleSelect = (section: string) => {
    const sectionIntentMap: Record<string, { visibleText: string; systemText: string }> = {
      personal: {
        visibleText: "Personal Details",
        systemText: "__SYS__modify_personal",
      },
      address: {
        visibleText: "Address Details",
        systemText: "__SYS__modify_address",
      },
      employment: {
        visibleText: "Employment Details",
        systemText: "__SYS__modify_employment",
      },
      income: {
        visibleText: "Income Details",
        systemText: "__SYS__modify_income",
      },
    };

    window.dispatchEvent(
      new CustomEvent("mock-send-message", {
        detail: sectionIntentMap[section] || { visibleText: section, systemText: section },
      })
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm mt-3">
      <div className="journey-surface p-5 mb-4">
        <h3 className="journey-heading mb-1">Which section would you like to update?</h3>
        <p className="journey-label mb-4">Select the section you want to modify:</p>
        
        <div className="flex flex-col gap-2">
          {sections.map((sec) => (
            <button
              key={sec.value}
              onClick={() => handleSelect(sec.value)}
              className="text-left p-3 rounded-[16px] border border-[#D5DCE3] bg-white hover:bg-[#F8FAFC] transition-all shadow-sm"
            >
              <div className="journey-value leading-5">{sec.label}</div>
              <div className="journey-label mt-2 leading-5">{sec.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
