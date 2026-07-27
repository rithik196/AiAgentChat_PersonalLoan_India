"use client";

import { useEffect } from "react";

interface DelayTriggerWidgetProps {
  data?: {
    auto_advance_ms?: number;
    next_message?: string;
    silent?: boolean;
  };
}

export function DelayTriggerWidget({ data }: DelayTriggerWidgetProps) {
  useEffect(() => {
    const autoAdvanceMs = data?.auto_advance_ms ?? 3000;
    const nextMessage = data?.next_message ?? "continue";
    const silent = data?.silent ?? true;

    const timer = setTimeout(() => {
      const detail = silent ? `__SYS__${nextMessage}` : nextMessage;
      window.dispatchEvent(new CustomEvent("mock-send-message", { detail }));
    }, autoAdvanceMs);

    return () => clearTimeout(timer);
  }, [data?.auto_advance_ms, data?.next_message, data?.silent]);

  return null;
}

