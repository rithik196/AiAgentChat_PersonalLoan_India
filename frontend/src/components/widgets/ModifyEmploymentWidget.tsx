"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { VOICE_WIDGET_FIELD_UPDATE_EVENT, type VoiceWidgetFieldUpdate } from "@/lib/voiceWidgetFields";

type ModifyEmploymentWidgetData = {
  employment?: {
    type?: string;
    industry?: string;
    employer?: string;
    experience?: string;
    workAddress?: {
      line1?: string;
      city?: string;
      postalCode?: string;
    };
  };
};

export function ModifyEmploymentWidget({ data, messageId }: { data?: ModifyEmploymentWidgetData; messageId?: string }) {
  const [employerType, setEmployerType] = useState(data?.employment?.type || "Private Sector");
  const [industry, setIndustry] = useState(data?.employment?.industry || "Banking & Finance");
  const [employerName, setEmployerName] = useState(data?.employment?.employer || "Newgen Software");
  const [experience, setExperience] = useState(data?.employment?.experience || "7 years");
  const [workLine1, setWorkLine1] = useState(data?.employment?.workAddress?.line1 || "Kingdom Tower, Office 1205");
  const [workCity, setWorkCity] = useState(data?.employment?.workAddress?.city || "Riyadh");
  const [workPostalCode, setWorkPostalCode] = useState(data?.employment?.workAddress?.postalCode || "12214");

  React.useEffect(() => {
    const handleVoiceUpdate = (event: Event) => {
      const detail = (event as CustomEvent<VoiceWidgetFieldUpdate>).detail;
      if (!detail || detail.widget !== "ModifyEmploymentWidget" || detail.messageId !== messageId) return;

      if (typeof detail.updates.employerType === "string") setEmployerType(detail.updates.employerType);
      if (typeof detail.updates.employerName === "string") setEmployerName(detail.updates.employerName);
      if (typeof detail.updates.industry === "string") setIndustry(detail.updates.industry);
      if (typeof detail.updates.experience === "string") setExperience(detail.updates.experience);
      if (typeof detail.updates.workAddress === "string") setWorkLine1(detail.updates.workAddress);
      if (typeof detail.updates.workCity === "string") setWorkCity(detail.updates.workCity);
      if (typeof detail.updates.workPostalCode === "string") setWorkPostalCode(detail.updates.workPostalCode);
    };

    window.addEventListener(VOICE_WIDGET_FIELD_UPDATE_EVENT, handleVoiceUpdate);
    return () => window.removeEventListener(VOICE_WIDGET_FIELD_UPDATE_EVENT, handleVoiceUpdate);
  }, [messageId]);

  const handleSubmit = () => {
    window.dispatchEvent(
      new CustomEvent("mock-send-message", {
        detail: {
          visibleText: "Save updated employment details",
          systemText: `__SYS__UPDATE_EMPLOYMENT: ${JSON.stringify({
            type: employerType,
            industry,
            employer: employerName,
            experience,
            workAddress: {
              line1: workLine1,
              city: workCity,
              postalCode: workPostalCode,
            },
          })}`,
        },
      })
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm mt-3">
      <div className="journey-surface p-5">
        <h3 className="journey-heading mb-4">Update Employment Details</h3>

        <div className="flex flex-col gap-4">
          <div>
            <label className="journey-label mb-2 block">Employer Type</label>
            <select
              value={employerType}
              onChange={(e) => setEmployerType(e.target.value)}
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] focus:outline-none focus:border-blue-400"
            >
              <option>Private Sector</option>
              <option>Government (Ministry / Semi-Government)</option>
              <option>Military / Defence</option>
              <option>Public Sector (PSU / State-Owned Enterprise)</option>
              <option>Bank / Financial Institution</option>
              <option>Listed Company</option>
            </select>
          </div>

          <div>
            <label className="journey-label mb-2 block">Employer Name</label>
            <input
              type="text"
              value={employerName}
              onChange={(e) => setEmployerName(e.target.value)}
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] focus:outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="journey-label mb-2 block">Industry Type</label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] focus:outline-none focus:border-blue-400"
            >
              <option>Banking & Finance</option>
              <option>Oil & Gas / Energy</option>
              <option>Banking & Financial Services</option>
              <option>Government Administration</option>
              <option>Construction & Real Estate</option>
              <option>Retail & Trading</option>
              <option>Healthcare & Pharmaceuticals</option>
              <option>Education</option>
              <option>Telecommunications & IT</option>
              <option>Manufacturing / Industrial</option>
              <option>Transportation & Logistics</option>
              <option>Software</option>
            </select>
          </div>

          <div>
            <label className="journey-label mb-2 block">Total Experience</label>
            <input
              type="text"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] focus:outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="journey-label mb-2 block">Work Address</label>
            <input
              type="text"
              value={workLine1}
              onChange={(e) => setWorkLine1(e.target.value)}
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] focus:outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="journey-label mb-2 block">Work City</label>
            <select
              value={workCity}
              onChange={(e) => setWorkCity(e.target.value)}
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] focus:outline-none focus:border-blue-400"
            >
              <option value="">Select city</option>
              <option>Riyadh</option>
              <option>Jeddah</option>
              <option>Dammam</option>
              <option>Mecca</option>
              <option>Medina</option>
              <option>Al Khobar</option>
            </select>
          </div>

          <div>
            <label className="journey-label mb-2 block">Work Post code</label>
            <input
              type="text"
              value={workPostalCode}
              onChange={(e) => setWorkPostalCode(e.target.value)}
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] focus:outline-none focus:border-blue-400"
            />
          </div>

          <button
            onClick={handleSubmit}
            className="w-full mt-2 py-2.5 journey-widget-button hover:opacity-90 transition-all"
          >
            Save Changes
          </button>
        </div>
      </div>
    </motion.div>
  );
}
