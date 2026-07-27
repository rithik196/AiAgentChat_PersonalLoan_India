"use client";

import React from "react";
import Image from "next/image";
import { FilePlus2, Loader2, Mic, Send, Square, Volume2 } from "lucide-react";
import type { VoiceState } from "@/hooks/useVoice";
import { cn } from "@/lib/utils";

interface ChatInputBarProps {
  input: string;
  isLoading: boolean;
  allowUpload: boolean;
  voiceState: VoiceState;
  supported: boolean;
  onInputChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onUpload: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDictationToggle: () => void;
  onOpenVoiceMode: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

const dictationConfig: Record<VoiceState, { icon: React.ReactNode; label: string; className: string }> = {
  idle: {
    icon: <Mic className="h-5 w-5" />,
    label: "Start dictation",
    className: "text-slate-500 hover:text-slate-700",
  },
  listening: {
    icon: <Square className="h-4 w-4" />,
    label: "Stop dictation",
    className: "text-red-500",
  },
  processing: {
    icon: <Loader2 className="h-5 w-5 animate-spin" />,
    label: "Processing voice",
    className: "text-amber-500",
  },
  speaking: {
    icon: <Volume2 className="h-5 w-5" />,
    label: "Stop speaking",
    className: "text-teal-600",
  },
};

export function ChatInputBar({
  input,
  isLoading,
  allowUpload,
  voiceState,
  supported,
  onInputChange,
  onSubmit,
  onUpload,
  onFileSelect,
  onDictationToggle,
  onOpenVoiceMode,
  fileInputRef,
}: ChatInputBarProps) {
  const hasText = input.trim().length > 0;
  const dictation = dictationConfig[voiceState];

  return (
    <form onSubmit={onSubmit} className="flex w-full items-center gap-2">
      <div className="flex min-h-[40px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 shadow-inner shadow-white/60">
        <input
          className="min-w-0 flex-1 bg-transparent type-body-md text-slate-700 placeholder:text-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400"
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={voiceState === "listening" ? "Listening..." : "Type your message here..."}
          disabled={isLoading || voiceState === "listening"}
        />

        <button
          type="button"
          onClick={onUpload}
          disabled={!allowUpload || isLoading || voiceState === "listening"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
          aria-label="Upload document"
          title={allowUpload ? "Upload document" : "Upload is currently unavailable"}
        >
          <FilePlus2 className="h-5 w-5" />
        </button>

        {supported && (
          <button
            type="button"
            onClick={onDictationToggle}
            disabled={voiceState === "processing" || isLoading}
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:text-slate-300",
              dictation.className
            )}
            aria-label={dictation.label}
            title={dictation.label}
          >
            {dictation.icon}
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          onChange={onFileSelect}
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png"
        />
      </div>

      {hasText ? (
        <button
          type="submit"
          disabled={isLoading}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-t from-blue-700 to-cyan-500 text-white shadow-lg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Send message"
          title="Send message"
        >
          <Send className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpenVoiceMode}
          disabled={!supported || isLoading}
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-transparent shadow-lg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Use voice mode"
          title="Use voice mode"
        >
          <Image
            src="/customer_agent/assets/useVoiceMode.png"
            alt=""
            width={40}
            height={40}
            className="h-full w-full object-cover"
          />
        </button>
      )}
    </form>
  );
}
