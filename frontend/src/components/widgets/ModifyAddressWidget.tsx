"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { VOICE_WIDGET_FIELD_UPDATE_EVENT, type VoiceWidgetFieldUpdate } from "@/lib/voiceWidgetFields";

type ModifyAddressWidgetData = {
  addressMode?: string;
  address?: {
    line1?: string;
    line2?: string;
    street?: string;
    city?: string;
    postalCode?: string;
    houseType?: string;
  };
};

export function ModifyAddressWidget({ data, messageId }: { data?: ModifyAddressWidgetData; messageId?: string }) {
  const isNewAddress = data?.addressMode === "new";
  const [line1, setLine1] = useState(isNewAddress ? "" : (data?.address?.line1 || ""));
  const [line2, setLine2] = useState(isNewAddress ? "" : (data?.address?.line2 || ""));
  const [street, setStreet] = useState(isNewAddress ? "" : (data?.address?.street || "Al Jamiah Street"));
  const [city, setCity] = useState(isNewAddress ? "" : (data?.address?.city || "Riyadh"));
  const [postalCode, setPostalCode] = useState(isNewAddress ? "" : (data?.address?.postalCode || "12836"));
  const [houseType, setHouseType] = useState(isNewAddress ? "" : (data?.address?.houseType || "Villa"));

  React.useEffect(() => {
    const handleVoiceUpdate = (event: Event) => {
      const detail = (event as CustomEvent<VoiceWidgetFieldUpdate>).detail;
      if (!detail || detail.widget !== "ModifyAddressWidget" || detail.messageId !== messageId) return;

      if (typeof detail.updates.line1 === "string") setLine1(detail.updates.line1);
      if (typeof detail.updates.line2 === "string") setLine2(detail.updates.line2);
      if (typeof detail.updates.street === "string") setStreet(detail.updates.street);
      if (typeof detail.updates.city === "string") setCity(detail.updates.city);
      if (typeof detail.updates.postalCode === "string") setPostalCode(detail.updates.postalCode);
      if (typeof detail.updates.houseType === "string") setHouseType(detail.updates.houseType);
    };

    window.addEventListener(VOICE_WIDGET_FIELD_UPDATE_EVENT, handleVoiceUpdate);
    return () => window.removeEventListener(VOICE_WIDGET_FIELD_UPDATE_EVENT, handleVoiceUpdate);
  }, [messageId]);

  const handleSubmit = () => {
    window.dispatchEvent(
      new CustomEvent("mock-send-message", {
        detail: {
          visibleText: "Save updated address details",
          systemText: `__SYS__UPDATE_ADDRESS: ${JSON.stringify({
            line1,
            line2,
            street,
            city,
            postalCode,
            houseType,
          })}`,
        },
      })
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm mt-3">
      <div className="journey-surface p-5">
        <h3 className="journey-heading mb-1">
          {isNewAddress ? "Add New Address" : "Update Address Details"}
        </h3>
        <p className="journey-label mb-4">
          {isNewAddress ? "Enter the new address details below." : "Edit the current address details below."}
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <label className="journey-label mb-2 block">Address Line 1</label>
            <input
              type="text"
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] focus:outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="journey-label mb-2 block">Address Line 2</label>
            <input
              type="text"
              value={line2}
              onChange={(e) => setLine2(e.target.value)}
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] focus:outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="journey-label mb-2 block">Street</label>
            <input
              type="text"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] focus:outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="journey-label mb-2 block">City</label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
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
            <label className="journey-label mb-2 block">Postal Code</label>
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] focus:outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="journey-label mb-2 block">House Type</label>
            <select
              value={houseType}
              onChange={(e) => setHouseType(e.target.value)}
              className="w-full rounded-[16px] border border-[#D5DCE3] bg-white px-3 py-2 text-[14px] leading-[16px] font-semibold text-[#0D141A] focus:outline-none focus:border-blue-400"
            >
              <option value="">Select house type</option>
              <option>Villa</option>
              <option>Owned Villa</option>
              <option>Owned Apartment</option>
              <option>Owned Traditional House</option>
              <option>Rented Apartment</option>
              <option>Rented Villa</option>
              <option>Company Provided Accommodation</option>
              <option>Shared Accommodation</option>
              <option>Family Owned (Not in applicant name)</option>
              <option>Government Housing</option>
            </select>
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
