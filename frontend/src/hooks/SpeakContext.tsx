"use client";

import { createContext, useContext } from "react";

type SpeakFn = (text: string) => void;

export const SpeakContext = createContext<SpeakFn | null>(null);

export function useSpeakContext() {
  return useContext(SpeakContext);
}
