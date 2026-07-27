"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface VoiceWaveformProps {
  mode: "ai" | "user";
}

const bars = [18, 22, 28, 34, 42, 54, 68, 82, 72, 56, 42, 34, 30, 36, 42, 38, 30];

export function VoiceWaveform({ mode }: VoiceWaveformProps) {
  return (
    <div className="flex h-20 items-end justify-center gap-1.5" aria-hidden="true">
      {bars.map((height, index) => (
        <span
          key={`${height}-${index}`}
          className={cn(
            "block w-1.5 rounded-full voice-wave-bar",
            mode === "ai" ? "voice-wave-ai" : "voice-wave-user"
          )}
          style={{
            height,
            animationDelay: `${index * 55}ms`,
          }}
        />
      ))}
    </div>
  );
}
