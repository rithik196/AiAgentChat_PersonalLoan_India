"use client";

import React from "react";
import { motion } from "framer-motion";

export interface PersonalDetailsWidgetProps {
  data?: {
    name: string;
    phone: string;
    email: string;
    is_etb?: boolean;
    personal: {
      idNumber: string;
      idExpirationDate?: string;
      nationality?: string;
      levelOfEducation?: string;
      maritalStatus?: string;
      dependents?: string;
    };
    address: {
      line1?: string;
      line2?: string;
      street?: string;
      city?: string;
      postalCode?: string;
      houseType?: string;
    };
    employment: {
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
    income: {
      monthly?: string;
      creditCardLimit?: string;
    };
    showActions?: boolean;
    missingFields?: string[];
    hideMissingMessage?: boolean;
    show_step_tracker?: boolean;
    tracker_step?: number;
    tracker_total?: number;
  };
}

export function PersonalDetailsWidget({ data }: PersonalDetailsWidgetProps) {
  if (!data) return null;
  const showActions = data.showActions !== false;
  const personalDetailsSource = data.is_etb ? "(Fetched from CBS)" : "(Fetched from Yakeen)";

  const handleModify = () => {
    // Use an explicit system intent so the journey can route deterministically.
    window.dispatchEvent(
      new CustomEvent("mock-send-message", {
        detail: {
          visibleText: "Modify Details",
          systemText: "__SYS__modify_section",
        },
      })
    );
  };

  const handleConfirm = () => {
    window.dispatchEvent(
      new CustomEvent("mock-send-message", {
        detail: {
          visibleText: "Details confirmed",
          systemText: "__SYS__continue",
        },
      })
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm mt-3 pb-6">
      <Section title="Personal Details" source={personalDetailsSource} icon="/customer_agent/assets/personal_details_logo.png">
        <Detail label="ID Number" value={data.personal.idNumber} />
        <Detail label="Name" value={data.name} />
        <Detail label="Contact Number" value={data.phone} />
        <Detail label="Email Id" value={data.email} wrap />
        <Detail label="Nationality" value={data.personal.nationality || ""} />
        <Detail label="ID expiration date" value={data.personal.idExpirationDate || ""} />
        <Detail label="Level of education" value={data.personal.levelOfEducation || "-"} />
        <Detail label="Marital Status" value={data.personal.maritalStatus || "-"} />
        <Detail label="No. of dependents" value={data.personal.dependents || "-"} />
      </Section>

      <Section title="Address Details" source="(Fetched from Saudi Post)" icon="/customer_agent/assets/address_details_logo.png">
        <Detail label="Address Line 1" value={data.address?.line1 || "-"} wrap />
        <Detail label="Address Line 2" value={data.address?.line2 || "-"} wrap />
        <Detail label="Street" value={data.address?.street || "-"} />
        <Detail label="City" value={data.address?.city || "-"} />
        <Detail label="Postal Code" value={data.address?.postalCode || "-"} />
        <Detail label="House Type" value={data.address?.houseType || "-"} />
      </Section>

      <Section title="Employment Details" source="(Fetched from GOSI)" icon="/customer_agent/assets/employment_det_logo.png">
        <Detail label="Employer type" value={data.employment.type || "-"} />
        <Detail label="Employer name" value={data.employment.employer || "-"} />
        <Detail label="Industry type" value={data.employment.industry || "-"} />
        <Detail label="Total Experience" value={data.employment.experience || "-"} />
        <Detail label="Work Address" value={data.employment.workAddress?.line1 || "-"} wrap />
        <Detail label="Work City" value={data.employment.workAddress?.city || "-"} />
        <Detail label="Work Post code" value={data.employment.workAddress?.postalCode || "-"} />
      </Section>

      <Section title="Income Details" source="(Fetched from GOSI)" icon="/customer_agent/assets/income_det_logo.png">
        <Detail label="Monthly Income" value={data.income.monthly || "-"} />
      </Section>

      {!showActions && !data.hideMissingMessage && (
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-medium text-blue-700">
         Please complete the missing details in chat to continue.
        </div>
      )}

      {showActions && (
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleModify}
            className="flex-1 py-3 journey-widget-button transition-all shadow-sm"
          >
            Modify Details
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3 journey-widget-button shadow-md hover:opacity-90 transition-all"
          >
            Confirm & Continue
          </button>
        </div>
      )}
    </motion.div>
  );
}

// --- Subcomponents ---

type SectionProps = {
  title: string;
  source?: string;
  icon?: string;
  children: React.ReactNode;
};

function Section({ title, source, icon, children }: SectionProps) {
  return (
    <div className="journey-panel p-4 mb-3">
      <div className="flex flex-col mb-3">
        <div className="flex items-center gap-2 ">
          {icon ? (
            <img
              src={icon}
              alt=""
              className="h-7 w-7 rounded-full object-cover flex-shrink-0 mt-2 "
            />
          ) : null}
          <span className="journey-heading">{title}</span>
        </div>
        {source && <span className={`journey-label mt-1 ${icon ? "ml-9" : "ml-0"}`}>{source}</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-2">
         {children}
      </div>
    </div>
  );
}

type DetailProps = {
  label: string;
  value?: string | null;
  wrap?: boolean;
};

function Detail({ label, value, wrap = false }: DetailProps) {
  return (
    <div className={`flex flex-col gap-2 ${wrap ? 'col-span-2' : ''}`}>
      <span className="journey-label">{label}</span>
      <span className={`journey-value ${wrap ? 'whitespace-normal' : 'truncate'}`}>{value ?? ""}</span>
    </div>
  );
}
