"use client";

import { useRef, useState, useCallback, useEffect, useSyncExternalStore } from "react";
import { getFemaleVoice } from "@/lib/voice";

// ── Browser Speech API types ───────────────────────────────────────
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as
    | (new () => SpeechRecognitionInstance)
    | null;
}

// NOTE: Do NOT check support at module level — it causes hydration mismatch
// because the server sees false while the client sees true. Instead, we check
// inside useEffect (see useVoice hook below).

// ── Hook ────────────────────────────────────────────────────────────
export type VoiceState = "idle" | "listening" | "processing" | "speaking";

type SpeakOptions = {
  onEnd?: () => void;
  onError?: () => void;
};

interface UseVoiceOptions {
  language?: string;
  ttsEnabled?: boolean;
  onTranscript: (text: string) => void;
}

export function useVoice({
  language = "en-US",
  ttsEnabled = true,
  onTranscript,
}: UseVoiceOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const listenRequestIdRef = useRef(0);

  // Hydration-safe: returns false on server, true on client (no mismatch)
  const supported = useSyncExternalStore(
    () => () => {},                     // subscribe (static value, no-op)
    () => !!getSpeechRecognition(),      // client snapshot
    () => false                          // server snapshot
  );

  // ── Release mic stream (plain function, no useCallback needed) ────
  function releaseMic() {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }

  // ── Start listening ───────────────────────────────────────────────
  const startListening = useCallback(async () => {
    const SpeechRec = getSpeechRecognition();
    if (!SpeechRec) return;

    const listenRequestId = listenRequestIdRef.current + 1;
    listenRequestIdRef.current = listenRequestId;
    setError(null);

    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    for (let attempt = 0; attempt < 80 && (synth?.speaking || synth?.pending); attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      if (listenRequestIdRef.current !== listenRequestId) {
        return;
      }
    }

    // Acquire mic permission first
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      const msg =
        e.name === "NotAllowedError"
          ? "Microphone access denied. Please allow mic permission in your browser settings."
          : e.name === "NotFoundError"
          ? "No microphone found. Please connect a mic and try again."
          : `Microphone error: ${e.message || e.name}`;
      setError(msg);
      setVoiceState("idle");
      return;
    }

    // Cancel any ongoing TTS
    window.speechSynthesis?.cancel();

    const recognition = new SpeechRec();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setVoiceState("listening");
      setInterimText("");
    };

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let final = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += transcript;
        else interim += transcript;
      }
      if (interim) setInterimText(interim);
      if (final.trim()) {
        setInterimText("");
        setVoiceState("processing");
        onTranscript(final.trim());
      }
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "audio-capture") {
        setError("Could not capture audio. Check your microphone and browser permissions.");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        console.error("Speech recognition error:", e.error);
      }
      releaseMic();
      setVoiceState("idle");
      setInterimText("");
    };

    recognition.onend = () => {
      releaseMic();
      setVoiceState((prev) => (prev === "listening" ? "idle" : prev));
      setInterimText("");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [language, onTranscript]);

  // ── Stop listening ────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    listenRequestIdRef.current += 1;
    recognitionRef.current?.stop();
    releaseMic();
    setVoiceState("idle");
    setInterimText("");
  }, []);

  // ── Toggle ────────────────────────────────────────────────────────
  const toggleVoice = useCallback(() => {
    if (voiceState === "listening") {
      stopListening();
    } else if (voiceState === "idle" || voiceState === "processing") {
      if (voiceState === "processing") setVoiceState("idle");
      else startListening();
    } else if (voiceState === "speaking") {
      window.speechSynthesis?.cancel();
      setVoiceState("idle");
    }
  }, [voiceState, startListening, stopListening]);

  // ── Reset to idle (called when assistant response arrives) ────────
  const resetToIdle = useCallback(() => {
    setVoiceState((prev) => (prev === "processing" ? "idle" : prev));
  }, []);

  // ── Speak (TTS) ──────────────────────────────────────────────────
  const speak = useCallback(
    (text: string, options?: SpeakOptions) => {
      const finishWithoutSpeech = () => {
        window.setTimeout(() => options?.onEnd?.(), 0);
      };

      if (!ttsEnabled || !window.speechSynthesis) {
        finishWithoutSpeech();
        return;
      }
      const clean = text.replace(/\*\*/g, "").replace(/[#_~`>]/g, "");
      if (!clean.trim()) {
        finishWithoutSpeech();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = language;
      const femaleVoice = getFemaleVoice(language);
      if (femaleVoice) utterance.voice = femaleVoice;
      utterance.rate = 1.0;
      utterance.pitch = 1.1;
      utterance.onstart = () => setVoiceState("speaking");
      utterance.onend = () => {
        setVoiceState("idle");
        options?.onEnd?.();
      };
      utterance.onerror = () => {
        setVoiceState("idle");
        options?.onError?.();
        options?.onEnd?.();
      };
      window.speechSynthesis.speak(utterance);
    },
    [language, ttsEnabled]
  );

  const clearError = useCallback(() => setError(null), []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      listenRequestIdRef.current += 1;
      releaseMic();
      window.speechSynthesis?.cancel();
    };
  }, []);

  return {
    voiceState,
    interimText,
    supported,
    error,
    clearError,
    toggleVoice,
    resetToIdle,
    speak,
    startListening,
    stopListening,
  };
}
