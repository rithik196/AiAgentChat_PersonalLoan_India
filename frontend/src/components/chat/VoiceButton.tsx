"use client";

import React from 'react';
import { Mic, Square, Loader2, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VoiceState } from '@/hooks/useVoice';

interface VoiceButtonProps {
  voiceState: VoiceState;
  onToggle: () => void;
  supported?: boolean;
}

const stateConfig: Record<VoiceState, { icon: React.ReactNode; classes: string; label: string }> = {
  idle: {
    icon: <Mic className="w-5 h-5 text-white" />,
    classes: "bg-gradient-to-t from-blue-700 to-cyan-500",
    label: "Start voice input",
  },
  listening: {
    icon: <Square className="w-4 h-4 text-white" />,
    classes: "bg-red-500 hover:bg-red-600 animate-pulse ring-4 ring-red-200",
    label: "Listening... tap to stop",
  },
  processing: {
    icon: <Loader2 className="w-5 h-5 text-white animate-spin" />,
    classes: "bg-amber-500",
    label: "Processing...",
  },
  speaking: {
    icon: <Volume2 className="w-5 h-5 text-white" />,
    classes: "bg-green-500 hover:bg-green-600 animate-pulse",
    label: "Speaking... tap to stop",
  },
};

export function VoiceButton({ voiceState, onToggle, supported = true }: VoiceButtonProps) {
  if (!supported) return null;

  const { icon, classes, label } = stateConfig[voiceState];

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={voiceState === "processing"}
      aria-label={label}
      title={label}
      className={cn(
        "p-3 rounded-xl transition-all duration-200 shadow-lg",
        classes
      )}
    >
      <div className="w-5 h-5 flex items-center justify-center">
        {icon}
      </div>
    </button>
  );
}
