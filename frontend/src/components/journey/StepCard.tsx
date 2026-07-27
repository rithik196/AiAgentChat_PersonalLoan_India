"use client";

import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, Lock, Circle } from 'lucide-react';

interface StepCardProps {
  title: string;
  status: 'locked' | 'active' | 'done';
  children?: ReactNode;
}

export function StepCard({ title, status, children }: StepCardProps) {
  const isDone = status === 'done';
  const isActive = status === 'active';

  return (
    <div className={cn(
      "flex flex-col gap-3 p-4 bg-white border-b border-slate-100 transition-opacity",
      status === 'locked' && "opacity-50"
    )}>
      <div className="flex items-center gap-3">
        {isDone ? (
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        ) : isActive ? (
          <Circle className="w-5 h-5 text-blue-600 fill-blue-50" />
        ) : (
          <Lock className="w-5 h-5 text-slate-400" />
        )}
        <h3 className={cn(
          "font-medium text-sm",
          isActive ? "text-slate-900" : "text-slate-500"
        )}>
          {title}
        </h3>
      </div>
      
      {(isActive || isDone) && children && (
        <div className="pl-8 text-sm">
          {children}
        </div>
      )}
    </div>
  );
}
