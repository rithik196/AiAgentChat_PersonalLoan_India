"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Option {
  id: string;
  label: string;
  value: string;
}

interface OptionButtonsProps {
  options: Option[];
  onSelect: (value: string) => void;
}

export function OptionButtons({ options, onSelect }: OptionButtonsProps) {
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const buttonLabel = useMemo(() => {
    if (options.length === 1) return options[0].label;
    return "Show options";
  }, [options]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!sheetRef.current) return;
      if (sheetRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("touchstart", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  if (!options || options.length === 0) return null;

  const handleSelect = (value: string) => {
    setOpen(false);
    onSelect(value);
  };

  return (
    <div className="w-full mt-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold shadow-sm transition-colors",
          "bg-white text-[#0D141A] border border-[#D5DCE3] hover:bg-slate-50"
        )}
      >
        <span>{buttonLabel}</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-3 sm:items-center">
          <div
            ref={sheetRef}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.55)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Choose an option</div>
                <div className="text-xs text-slate-500">Tap one choice or say it in voice mode.</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close options"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 max-h-[55vh] overflow-y-auto pr-1">
              <div className="flex flex-col gap-2">
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-900 transition-colors hover:border-[#86BFE0] hover:bg-[#F1F8FD]"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
