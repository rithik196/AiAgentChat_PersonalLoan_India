"use client";

import React from 'react';

interface FieldValueProps {
  label: string;
  value: string | null;
}

export function FieldValue({ label, value }: FieldValueProps) {
  return (
    <div className="flex flex-col py-1">
      <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      {value ? (
        <span className="text-sm font-medium text-slate-900 animate-in fade-in slide-in-from-bottom-1">{value}</span>
      ) : (
        <span className="text-sm text-slate-300 italic">Pending...</span>
      )}
    </div>
  );
}
