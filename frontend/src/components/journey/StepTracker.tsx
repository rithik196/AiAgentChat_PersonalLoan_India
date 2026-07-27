"use client";

import React from 'react';
import { cn } from '@/lib/utils';

interface StepTrackerProps {
  currentStep: number;
  totalSteps: number;
}

export function StepTracker({ currentStep, totalSteps }: StepTrackerProps) {
  return (
    <div className="flex items-center gap-2 p-4 w-full bg-white">
      {Array.from({ length: totalSteps }).map((_, i) => {
        const step = i + 1;
        const isActive = step === currentStep;
        const isPast = step < currentStep;

        return (
          <div key={step} className="flex-1 flex items-center gap-2">
            <div
              className={cn(
                "h-2 w-full rounded-full transition-colors",
                isActive ? "bg-blue-600" : isPast ? "bg-blue-300" : "bg-slate-200"
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
