"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { VOICE_WIDGET_FIELD_UPDATE_EVENT, type VoiceWidgetFieldUpdate } from "@/lib/voiceWidgetFields";

type ModifyPersonalWidgetData = {
  email?: string;
  emailId?: string;
  personal?: {
    levelOfEducation?: string;
    education?: string;
    maritalStatus?: string;
    dependents?: string;
    email?: string;
    emailId?: string;
  };
};

export function ModifyPersonalWidget({ data, messageId }: { data?: ModifyPersonalWidgetData; messageId?: string }) {
  const [education, setEducation] = useState(data?.personal?.levelOfEducation || data?.personal?.education || "");
  const [marital, setMarital] = useState(data?.personal?.maritalStatus || "");
  const [dependents, setDependents] = useState(data?.personal?.dependents || "");
  const [email, setEmail] = useState(
    data?.email || data?.emailId || data?.personal?.email || data?.personal?.emailId || ""
  );

  React.useEffect(() => {
    const handleVoiceUpdate = (event: Event) => {
      const detail = (event as CustomEvent<VoiceWidgetFieldUpdate>).detail;
      if (!detail || detail.widget !== "ModifyPersonalWidget" || detail.messageId !== messageId) return;

      if (typeof detail.updates.email === "string") setEmail(detail.updates.email);
      if (typeof detail.updates.levelOfEducation === "string") setEducation(detail.updates.levelOfEducation);
      if (typeof detail.updates.maritalStatus === "string") setMarital(detail.updates.maritalStatus);
      if (typeof detail.updates.dependents === "string") setDependents(detail.updates.dependents);
    };

    window.addEventListener(VOICE_WIDGET_FIELD_UPDATE_EVENT, handleVoiceUpdate);
    return () => window.removeEventListener(VOICE_WIDGET_FIELD_UPDATE_EVENT, handleVoiceUpdate);
  }, [messageId]);

  const handleSubmit = () => {
    window.dispatchEvent(
      new CustomEvent("mock-send-message", {
          detail: {
            visibleText: "Save updated personal details",
            systemText: `__SYS__UPDATE_PERSONAL: ${JSON.stringify({
              levelOfEducation: education,
              maritalStatus: marital,
              dependents: dependents,
              email,
            })}`,
          },
        })
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm mt-3">
      <div className="journey-surface p-5">
        <h3 className="journey-heading mb-4">Update Personal Details</h3>
        
        <div className="flex flex-col gap-4">
          <div>
            <label className="journey-label mb-2 block">Email Id</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] placeholder:text-slate-400 focus:outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="journey-label mb-2 block">Level of Education</label>
            <select 
              value={education} 
              onChange={(e) => setEducation(e.target.value)}
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] focus:outline-none focus:border-blue-400"
            >
              <option></option>
              <option>Graduation</option>
              <option>Primary Education</option>
              <option>Intermediate (Middle School)</option>
              <option>Secondary (High School)</option>
              <option>Diploma (Associate / Intermediate)</option>
              <option>Bachelor&apos;s Degree</option>
              <option>Master&apos;s Degree</option>
              <option>Doctorate (PhD)</option>
            </select>
          </div>

          <div>
            <label className="journey-label mb-2 block">Marital Status</label>
            <select 
              value={marital} 
              onChange={(e) => setMarital(e.target.value)}
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] focus:outline-none focus:border-blue-400"
            >
              <option></option>
              <option>Single</option>
              <option>Married</option>
              <option>Divorced</option>
              <option>Widowed</option>
              <option>Separated</option>
              <option>Polygamous</option>
            </select>
          </div>

          <div>
            <label className="journey-label mb-2 block">Number of Dependents</label>
            <select 
              value={dependents} 
              onChange={(e) => setDependents(e.target.value)}
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] focus:outline-none focus:border-blue-400"
            >
              <option></option>
              <option>0</option>
              <option>1</option>
              <option>2</option>
              <option>3</option>
              <option>4</option>
              <option>5</option>
              <option>6+</option>
            </select>
          </div>

          <button
            onClick={handleSubmit}
            className="w-full mt-3 py-2.5 journey-widget-button hover:opacity-90 transition-all"
          >
            Save Changes
          </button>
        </div>
      </div>
    </motion.div>
  );
}
