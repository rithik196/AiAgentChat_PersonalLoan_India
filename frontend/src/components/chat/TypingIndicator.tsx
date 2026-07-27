"use client";

import React from 'react';

export function TypingIndicator() {
  return (
    <div className="flex w-full justify-start">
      <div className="rounded-[16px] border border-[#D5DCE3] px-4 py-3 shadow-sm" style={{ backgroundImage: "linear-gradient(90deg, #EBF4F5 0%, #B9DCF2 100%)" }}>
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
