"use client";

import React, { ReactNode } from 'react';

interface JourneyLayoutProps {
  chatPanel: ReactNode;
  journeyPanel: ReactNode;
}

export function JourneyLayout({ chatPanel, journeyPanel }: JourneyLayoutProps) {
  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-slate-50 overflow-hidden">
      {/* Mobile view typically shows chat primarily with journey as an overlay or top bar, 
          but for simplicity in this responsive layout we split them on desktop and stack on mobile. */}
      
      {/* Chat Panel (Top on mobile, Left on desktop) */}
      <div className="flex-1 w-full h-full relative">
        {chatPanel}
      </div>

      {/* Journey Panel — hidden for now */}
      {/* <div className="w-full md:w-1/3 lg:w-1/4 bg-white border-t md:border-t-0 md:border-l border-slate-200 overflow-y-auto">
        {journeyPanel}
      </div> */}
    </div>
  );
}
