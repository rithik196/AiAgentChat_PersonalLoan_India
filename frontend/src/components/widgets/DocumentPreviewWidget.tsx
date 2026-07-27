"use client";

import React from "react";
import { motion } from "framer-motion";

interface Document {
  name: string;
  type: string;
  url?: string;
}

interface DocumentPreviewWidgetProps {
  data?: {
    documents?: Document[];
    title?: string;
    subtitle?: string;
    current_step?: number;
    show_step_tracker?: boolean;
    tracker_step?: number;
    tracker_total?: number;
  };
}

const APP_BASE_PATH = "/customer_agent";
const DEFAULT_DOCUMENT_URL = "/assets/ContractSaudi.pdf";

function withAppBasePath(path: string) {
  if (path.startsWith(APP_BASE_PATH)) return path;
  return `${APP_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}

function resolveDocumentUrl(url?: string) {
  const rawUrl = url || DEFAULT_DOCUMENT_URL;

  if (/^https?:\/\//i.test(rawUrl) || rawUrl.startsWith("blob:") || rawUrl.startsWith("data:")) {
    return rawUrl;
  }

  // Preserve older chat history that stored generated PDFs as frontend-static paths.
  if (rawUrl.startsWith("/generated/")) {
    const filename = rawUrl.split("/").pop() || "";
    return withAppBasePath(`/api/chat/generated-documents/${encodeURIComponent(filename)}`);
  }

  if (rawUrl.startsWith("/")) {
    return withAppBasePath(rawUrl);
  }

  return rawUrl;
}

function buildDownloadUrl(url: string) {
  if (!url.includes("/api/chat/generated-documents/")) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}download=1`;
}

function filenameForDocument(doc: Document) {
  return `${doc.name.replace(/[^\w.-]+/g, "_")}.pdf`;
}

export function DocumentPreviewWidget({ data }: DocumentPreviewWidgetProps) {
  const currentStep = data?.current_step || 4;
  const isCertificateStep = currentStep === 3;
  const actionLabel = isCertificateStep ? "Proceed to next step" : "E-Sign via Nafath";

  const documents = data?.documents || [
    { name: "Contract Letter", type: "pdf", url: "/customer_agent/assets/ContractSaudi.pdf" },
    { name: "Promissory Note", type: "pdf", url: "/customer_agent/assets/PromissoryNote.pdf" },
  ];
  const title = data?.title || "Digital Documents";
  const subtitle = data?.subtitle || "Ready for E-Sign";

  const openDocument = (doc: Document) => {
    const url = encodeURI(resolveDocumentUrl(doc.url));
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const downloadDocument = (doc: Document) => {
    const url = encodeURI(buildDownloadUrl(resolveDocumentUrl(doc.url)));
    const a = document.createElement("a");
    a.href = url;
    a.download = filenameForDocument(doc);
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleAction = () => {
    const systemText = isCertificateStep ? "__SYS__proceed_contract_prompt" : "__SYS__proceed_esign";
    window.dispatchEvent(
      new CustomEvent("mock-send-message", {
        detail: {
          visibleText: actionLabel,
          systemText: systemText,
        },
      })
    );
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as [number, number, number, number], staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.4 } },
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="w-full max-w-sm mt-4">
      <div className="journey-surface p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-white border border-[#D5DCE3] flex items-center justify-center shadow-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#1B739E]">
              <path
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <h3 className="journey-heading">{title}</h3>
            <p className="journey-label mt-1">{subtitle}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3 mb-5">
            {documents.map((doc) => (
              <motion.div
                key={doc.name}
                variants={itemVariants}
                onClick={() => openDocument(doc)}
                className="journey-panel p-3 relative group hover:bg-[#F8FAFC] transition-colors cursor-pointer"
              >
                <div className="bg-white rounded-[16px] p-2 mb-3 h-[70px] flex flex-col gap-1.5 justify-center items-center relative overflow-hidden border border-[#D5DCE3]">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#EBF4F5] to-[#B9DCF2] opacity-40" />
                  <svg className="w-8 h-8 text-[#1B739E]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="absolute bottom-1 right-1.5 journey-label">{doc.type}</span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadDocument(doc);
                  }}
                  className="absolute top-5 right-5 p-1.5 bg-[#EBF4F5] rounded-[8px] hover:bg-[#B9DCF2] opacity-100 transition-colors border border-transparent  z-1"
                  aria-label={`Download ${doc.name}`}
                >
                  <svg className="w-3.5 h-3.5 text-[#1B739E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>

                <p className="journey-label leading-tight line-clamp-2 pr-8">{doc.name}</p>
              </motion.div>
            ))}
        </div>

          <button
            onClick={handleAction}
            className="w-full py-3.5 journey-widget-button text-[14px] shadow-lg transition-all duration-300"
          >
            {actionLabel}
          </button>
      </div>
    </motion.div>
  );
}
