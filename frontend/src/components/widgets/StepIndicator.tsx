"use client";

interface StepIndicatorProps {
  currentStep?: number;
  totalSteps?: number;
  show?: boolean;
}

export function StepIndicator({ currentStep, totalSteps = 5, show = false }: StepIndicatorProps) {
  if (!show || !currentStep) {
    return null;
  }

  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="journey-step-circle">
        {currentStep}
      </span>
      <span className="journey-value">
        {`Step ${currentStep}/${totalSteps}`}
      </span>
    </div>
  );
}
