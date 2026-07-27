import React from 'react';
import { JourneyLayout as JourneyLayoutComponent } from '@/components/journey/JourneyLayout';
import { StepTracker } from '@/components/journey/StepTracker';
import { StepCard } from '@/components/journey/StepCard';
import { FieldValue } from '@/components/journey/FieldValue';
import { SummaryBar } from '@/components/journey/SummaryBar';

export default function JourneyLayout({ children }: { children: React.ReactNode }) {
  const journeyPanel = (
    <div className="flex flex-col h-full bg-white relative">
      {/* Tracker removed as per user request to move to top left of widgets */}
      
      {/* Scrollable steps */}
      <div className="flex-1 overflow-y-auto pb-20">
        <StepCard title="Identity Verification" status="active">
          <FieldValue label="ID Number" value={null} />
          <FieldValue label="ID Type" value={null} />
        </StepCard>
        <StepCard title="Personalized Offer" status="locked" />
        <StepCard title="Trade / Agreement" status="locked" />
        <StepCard title="Digital Signature" status="locked" />
        <StepCard title="Account & Disbursement" status="locked" />
      </div>

      {/* Summary Footer */}
      <SummaryBar loanAmount={null} emi={null} />
    </div>
  );

  return (
    <JourneyLayoutComponent
      chatPanel={children}
      journeyPanel={journeyPanel}
    />
  );
}
