"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useChat, type UIMessage } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai';
import { ChatWindow } from '@/components/chat/ChatWindow';
import type { ChatWindowMessage } from '@/components/chat/ChatWindow';
import { ChatInputBar } from '@/components/chat/ChatInputBar';
import { VoiceModePanel } from '@/components/chat/VoiceModePanel';
import { LogOut } from 'lucide-react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useVoice } from '@/hooks/useVoice';
import { SpeakContext } from '@/hooks/SpeakContext';
import { buildDisbursementVoiceSummary, buildVoicePreviewText, buildVoiceSpeechText } from '@/lib/voicePrompt';
import { resolveVoiceJourneyAction, type VoiceResolvedAction } from '@/lib/voiceActions';
import { dispatchVoiceWidgetFieldUpdate, isEditableVoiceWidget, resolveVisibleVoiceWidgetUpdate, VOICE_WIDGET_PROMPT_EVENT } from '@/lib/voiceWidgetFields';
import { PersonalDetailsWidget } from '@/components/widgets/PersonalDetailsWidget';
import type { PersonalDetailsWidgetProps } from '@/components/widgets/PersonalDetailsWidget';
import type { MessageBubbleProps } from '@/components/chat/MessageBubble';

/** Convert saved conversation messages → UIMessage format for useChat */
function toUIMessages(saved: { role: string; content: string; timestamp?: number; widget?: unknown; metadata?: unknown }[]): UIMessage[] {
  return saved.map((m, i) => ({
    id: `hist_${i}_${m.timestamp || i}`,
    role: m.role as "user" | "assistant",
    parts: [{ type: "text" as const, text: m.content }],
    metadata: (m.metadata || (m.widget ? { widget: m.widget } : undefined)) as UIMessage["metadata"],
  }));
}

function getMessageText(message?: UIMessage): string {
  if (!message) return "";
  return (
    message.parts
      ?.filter((part) => part.type === "text")
      .map((part) => ("text" in part ? part.text : ""))
      .filter(Boolean)
      .join("") || ""
  );
}

function hasMessageWidget(message?: UIMessage): boolean {
  if (!message) return false;
  const metadata = message.metadata as { widget?: unknown } | undefined;
  if (metadata?.widget) return true;
  if (message.parts?.some((part) => part.type === "data-widget" && Boolean(part.data))) return true;
  return /<WIDGET_DATA>[\s\S]*?<\/WIDGET_DATA>/.test(getMessageText(message));
}

function getMessageWidgetName(message?: UIMessage): string | null {
  if (!message) return null;

  const metadata = message.metadata as { widget?: unknown } | undefined;
  if (metadata?.widget && isWidgetSpec(metadata.widget)) {
    return metadata.widget.widget || null;
  }

  const widgetDataPart = message.parts?.find((part) => part.type === "data-widget");
  if (widgetDataPart && "data" in widgetDataPart && isWidgetSpec(widgetDataPart.data)) {
    return widgetDataPart.data.widget || null;
  }

  const widgetMatch = getMessageText(message).match(/<WIDGET_DATA>([\s\S]*?)<\/WIDGET_DATA>/);
  if (widgetMatch?.[1]) {
    try {
      const parsed = JSON.parse(widgetMatch[1]) as WidgetSpec;
      return typeof parsed.widget === "string" ? parsed.widget : null;
    } catch {
      return null;
    }
  }

  return null;
}

type WidgetSpec = {
  widget?: string;
  data?: Record<string, unknown>;
};

type DisbursementVoiceData = {
  customer_name?: string;
  reference?: string;
  date?: string;
  amount?: number;
  account?: string;
  tenure?: string;
  profit_rate?: string;
  first_installment?: string;
  monthly_installment?: number;
  total_payable?: number;
  bank?: string;
  beneficiary?: string;
};

type PersonalDetailsData = NonNullable<PersonalDetailsWidgetProps["data"]>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWidgetSpec(value: unknown): value is WidgetSpec {
  return isObject(value) && typeof value.widget === "string";
}

function isPersonalDetailsData(value: unknown): value is PersonalDetailsData {
  if (!isObject(value)) return false;
  const personal = value.personal;
  const address = value.address;
  const employment = value.employment;
  const income = value.income;

  return (
    typeof value.name === "string" &&
    typeof value.phone === "string" &&
    typeof value.email === "string" &&
    isObject(personal) &&
    typeof personal.idNumber === "string" &&
    isObject(address) &&
    isObject(employment) &&
    isObject(income)
  );
}

function toChatWindowMessage(message: UIMessage): ChatWindowMessage {
  const parts = (message.parts ?? []).map((part) => {
    const next: NonNullable<MessageBubbleProps["parts"]>[number] = {};

    if ("type" in part && typeof part.type === "string") {
      next.type = part.type;
    }
    if ("text" in part && typeof part.text === "string") {
      next.text = part.text;
    }
    if ("data" in part) {
      next.data = part.data;
    }

    return next;
  });

  const metadata = message.metadata as MessageBubbleProps["metadata"];

  return {
    id: message.id,
    role: message.role as "user" | "assistant",
    parts,
    metadata,
    content: getMessageText(message) || undefined,
  };
}

function extractLatestPersonalDetails(messages: UIMessage[]): PersonalDetailsData | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const metadata = msg.metadata as { widget?: WidgetSpec; customerProfile?: unknown } | undefined;
    let widgetSpec = metadata?.widget;

    if (!widgetSpec) {
      const widgetDataPart = msg.parts?.find((part) => part.type === "data-widget");
      if (widgetDataPart && "data" in widgetDataPart && isWidgetSpec(widgetDataPart.data)) {
        widgetSpec = widgetDataPart.data;
      }
    }

    if (!widgetSpec) {
      const text = getMessageText(msg);
      const widgetMatch = text.match(/<WIDGET_DATA>([\s\S]*?)<\/WIDGET_DATA>/);
      if (widgetMatch?.[1]) {
        try {
          widgetSpec = JSON.parse(widgetMatch[1]) as WidgetSpec;
        } catch {
          widgetSpec = undefined;
        }
      }
    }

    if (widgetSpec?.widget === 'PersonalDetailsWidget' && isPersonalDetailsData(widgetSpec.data)) {
      return { ...widgetSpec.data, showActions: false, hideMissingMessage: true };
    }

    if (isPersonalDetailsData(metadata?.customerProfile)) {
      return { ...metadata.customerProfile, showActions: false, hideMissingMessage: true };
    }
  }

  return null;
}

function extractSessionPersonalDetails(session: Record<string, unknown> | null): PersonalDetailsData | null {
  const profile = session?.customer_profile;
  if (!isPersonalDetailsData(profile)) return null;
  return { ...profile, showActions: false, hideMissingMessage: true };
}

const VOICE_POST_SPEECH_HOLD_MS = 1000;
const VOICE_MIN_SPEECH_MS = 1200;
const VOICE_MAX_SPEECH_MS = 45000;
const VOICE_WORDS_PER_MINUTE = 155;
const VOICE_MS_PER_CHARACTER_FLOOR = 35;
const VOICE_TTS_FAILSAFE_EXTRA_MS = 2500;
const VOICE_ASSISTANT_ECHO_GUARD_MS = 4000;
const VOICE_WIDGET_UPDATE_PROMPT =
  "Updated. You can make another change or say save changes.";

const SPOKEN_DIGIT_MAP: Record<string, string> = {
  zero: "0",
  oh: "0",
  o: "0",
  one: "1",
  won: "1",
  two: "2",
  to: "2",
  too: "2",
  three: "3",
  four: "4",
  for: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  ate: "8",
  nine: "9",
};

function estimateVoiceSpeechMs(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const wordEstimateMs = (wordCount / VOICE_WORDS_PER_MINUTE) * 60_000;
  const characterEstimateMs = trimmed.length * VOICE_MS_PER_CHARACTER_FLOOR;

  return Math.min(
    VOICE_MAX_SPEECH_MS,
    Math.max(VOICE_MIN_SPEECH_MS, wordEstimateMs, characterEstimateMs)
  );
}

function normalizeVoiceEchoText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeAssistantSpeechEcho(transcript: string, spokenText: string): boolean {
  const heard = normalizeVoiceEchoText(transcript);
  const spoken = normalizeVoiceEchoText(spokenText);
  if (heard.length < 12 || spoken.length < 12) return false;
  return spoken.includes(heard) || heard.includes(spoken);
}

function isEligibleOfferContinuationTranscript(text: string): boolean {
  const normalized = normalizeVoiceEchoText(text);
  if (!normalized) return false;

  if (/\bcontinu\w*\b/.test(normalized)) return true;
  if (/\bproce\w*\b/.test(normalized)) return true;
  if (/\breview\w*\b/.test(normalized) && /\bdetail\w*\b/.test(normalized)) return true;

  return false;
}

function extractIbanFromVoiceTranscript(transcript: string): string | null {
  const explicit = transcript.toUpperCase().match(/SA[\s-]*[A-Z0-9\s-]{12,}/);
  if (explicit?.[0]) {
    const cleanedExplicit = explicit[0].replace(/[^A-Z0-9]/g, "");
    if (cleanedExplicit.startsWith("SA") && cleanedExplicit.length >= 20) {
      return cleanedExplicit.slice(0, 24);
    }
  }

  const tokens = transcript
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const chunks: string[] = [];

  for (const token of tokens) {
    if (token === "sa") {
      chunks.push("S", "A");
      continue;
    }
    if (token === "s" || token === "a") {
      chunks.push(token.toUpperCase());
      continue;
    }
    if (SPOKEN_DIGIT_MAP[token] !== undefined) {
      chunks.push(SPOKEN_DIGIT_MAP[token]);
      continue;
    }
    if (/^\d+$/.test(token)) {
      chunks.push(token);
    }
  }

  if (chunks.length === 0) return null;
  const collapsed = chunks.join("").replace(/[^A-Z0-9]/g, "");
  const startIndex = collapsed.indexOf("SA");
  if (startIndex < 0) return null;

  const candidate = collapsed.slice(startIndex);
  if (candidate.length < 20) return null;
  return candidate.slice(0, 24);
}

function includesVoicePhrase(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => {
    const pattern = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "i");
    return pattern.test(text);
  });
}

function extractOrdinalAccountIndex(text: string): number | null {
  const normalized = normalizeVoiceEchoText(text);
  const ordinalPatterns: Array<{ pattern: RegExp; index: number }> = [
    { pattern: /\b(first|1st|one)\b/, index: 0 },
    { pattern: /\b(second|2nd|two)\b/, index: 1 },
    { pattern: /\b(third|3rd|three)\b/, index: 2 },
    { pattern: /\b(fourth|4th|four)\b/, index: 3 },
    { pattern: /\b(fifth|5th|five)\b/, index: 4 },
  ];

  for (const { pattern, index } of ordinalPatterns) {
    if (pattern.test(normalized)) return index;
  }

  return null;
}

function getMessageWidgetData(message?: UIMessage): Record<string, unknown> | null {
  if (!message) return null;

  const metadata = message.metadata as { widget?: unknown } | undefined;
  if (metadata?.widget && isWidgetSpec(metadata.widget)) {
    return (metadata.widget.data as Record<string, unknown> | undefined) || null;
  }

  const widgetDataPart = message.parts?.find((part) => part.type === "data-widget");
  if (widgetDataPart && "data" in widgetDataPart && isWidgetSpec(widgetDataPart.data)) {
    return (widgetDataPart.data.data as Record<string, unknown> | undefined) || null;
  }

  const widgetMatch = getMessageText(message).match(/<WIDGET_DATA>([\s\S]*?)<\/WIDGET_DATA>/);
  if (widgetMatch?.[1]) {
    try {
      const parsed = JSON.parse(widgetMatch[1]) as WidgetSpec;
      return (parsed.data as Record<string, unknown> | undefined) || null;
    } catch {
      return null;
    }
  }

  return null;
}

function getVoiceSpeechContent(message: UIMessage | undefined): { previewText: string; speechText: string } {
  const text = getMessageText(message);
  const widgetName = getMessageWidgetName(message);
  const widgetData = getMessageWidgetData(message);

  if (widgetName === "DisbursementWidget") {
    const summary = buildDisbursementVoiceSummary(widgetData as DisbursementVoiceData | null | undefined);
    if (summary) {
      return {
        previewText: summary,
        speechText: summary,
      };
    }
  }

  return {
    previewText: buildVoicePreviewText(text),
    speechText: buildVoiceSpeechText(text),
  };
}

export default function JourneyPage() {
  const params = useParams();
  const router = useRouter();
  const product = params.product as string;

  const [phone, setPhone] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
  const [initialSession, setInitialSession] = useState<Record<string, unknown> | null>(null);

  // Check auth on mount — redirect to login if not authenticated
  useEffect(() => {
    fetch("/customer_agent/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated && data.phone) {
          setPhone(data.phone);
        } else {
          router.replace("/login");
        }
        setAuthChecked(true);
      })
      .catch(() => {
        router.replace("/login");
        setAuthChecked(true);
      });
  }, [router]);

  // Session ID derived from phone number + product (stable across refreshes)
  const sessionId = phone ? `${phone}_${product}` : "";

  // Load conversation history after auth
  useEffect(() => {
    if (!sessionId) return;
    fetch(`/customer_agent/api/chat/history/${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data) => {
        setInitialSession(data.session || null);
        if (data.messages && data.messages.length > 0) {
          setInitialMessages(toUIMessages(data.messages));
        } else {
          // No history — show welcome message
          setInitialMessages([
            {
              id: `welcome_${product}`,
              role: 'assistant' as const,
              parts: [{ type: 'text' as const, text: `Welcome to the ${product.replace('_', ' ')} application! I am Raya, your Agentic Finance Advisor. To get started, could you please provide your National ID?` }],
            },
          ]);
        }
      })
      .catch(() => {
        setInitialSession(null);
        setInitialMessages([
          {
            id: `welcome_${product}`,
            role: 'assistant' as const,
            parts: [{ type: 'text' as const, text: `Welcome to the ${product.replace('_', ' ')} application! I am Raya, your Agentic Finance Advisor. To get started, could you please provide your National ID?` }],
          },
        ]);
      });
  }, [sessionId, product]);

  // Show loading while checking auth or loading history
  if (!authChecked || !phone || !initialMessages) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <SpeakContext.Provider value={() => {}}>
      <ChatView
        product={product}
        sessionId={sessionId}
        initialMessages={initialMessages}
        initialSession={initialSession}
      />
    </SpeakContext.Provider>
  );
}

/** Inner component — only mounted after auth + history are resolved */
function ChatView({ product, sessionId, initialMessages, initialSession }: {
  product: string;
  sessionId: string;
  initialMessages: UIMessage[];
  initialSession: Record<string, unknown> | null;
}) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [voicePanelText, setVoicePanelText] = useState('');
  const [lastVoiceUserText, setLastVoiceUserText] = useState('');
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [bufferedAssistantIds, setBufferedAssistantIds] = useState<Set<string>>(new Set());
  const [instantRevealAssistantIds, setInstantRevealAssistantIds] = useState<Set<string>>(new Set());
  const [knownMessageIds, setKnownMessageIds] = useState<Set<string>>(
    () => new Set(initialMessages.map((message) => message.id))
  );
  const [activeVoicePreviewId, setActiveVoicePreviewId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { messages, status, sendMessage, setMessages } = useChat({
    id: sessionId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/customer_agent/api/chat',
      headers: { 'x-session-id': sessionId },
      body: { sessionId, session: initialSession ?? undefined },
    }),
  });

  const latestPersonalDetails = extractLatestPersonalDetails(messages) ?? extractSessionPersonalDetails(initialSession);
  const isLoading = status === 'submitted' || status === 'streaming';

  // Track whether voice mode is active (user initiated via mic button)
  const voiceModeRef = useRef(false);
  const knownMessageIdsRef = useRef<Set<string>>(new Set(initialMessages.map((message) => message.id)));
  const spokenAssistantIdsRef = useRef<Set<string>>(new Set());
  const resolvedVoicePromptIdsRef = useRef<Set<string>>(new Set());
  const activeVoicePreviewIdRef = useRef<string | null>(null);
  const voiceCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceSpeechMinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceSpeechFailsafeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceCommitGenerationRef = useRef(0);
  const speakRef = useRef<((text: string, options?: { onEnd?: () => void; onError?: () => void }) => void) | null>(null);
  const startListeningRef = useRef<(() => void) | null>(null);
  const resetToIdleRef = useRef<(() => void) | null>(null);
  const recentAssistantSpeechRef = useRef<{ text: string; until: number } | null>(null);
  const pendingVoiceInteractionRef = useRef<{
    text: string;
    messageId: string;
    action: VoiceResolvedAction | null;
    needsWidget: boolean;
  } | null>(null);
  const autoListenAfterSpeechRef = useRef(false);

  const clearVoiceCommitTimer = useCallback(() => {
    if (voiceCommitTimerRef.current) {
      clearTimeout(voiceCommitTimerRef.current);
      voiceCommitTimerRef.current = null;
    }
  }, []);

  const rememberAssistantSpeechForEchoGuard = useCallback((speechText: string) => {
    recentAssistantSpeechRef.current = {
      text: speechText,
      until: Date.now() + estimateVoiceSpeechMs(speechText) + VOICE_TTS_FAILSAFE_EXTRA_MS + VOICE_ASSISTANT_ECHO_GUARD_MS,
    };
  }, []);

  const isAssistantSpeechEcho = useCallback((text: string) => {
    const recentSpeech = recentAssistantSpeechRef.current;
    if (!recentSpeech) return false;
    if (Date.now() > recentSpeech.until) {
      recentAssistantSpeechRef.current = null;
      return false;
    }
    return looksLikeAssistantSpeechEcho(text, recentSpeech.text);
  }, []);

  const clearVoiceLifecycleTimers = useCallback(() => {
    clearVoiceCommitTimer();
    if (voiceSpeechMinTimerRef.current) {
      clearTimeout(voiceSpeechMinTimerRef.current);
      voiceSpeechMinTimerRef.current = null;
    }
    if (voiceSpeechFailsafeTimerRef.current) {
      clearTimeout(voiceSpeechFailsafeTimerRef.current);
      voiceSpeechFailsafeTimerRef.current = null;
    }
  }, [clearVoiceCommitTimer]);

  const commitVoicePreview = useCallback(
    (assistantId: string | null, immediate = false, afterRelease?: () => void) => {
      if (!assistantId) return;
      clearVoiceCommitTimer();

      const release = () => {
        setBufferedAssistantIds((current) => {
          if (!current.has(assistantId)) return current;
          const next = new Set(current);
          next.delete(assistantId);
          return next;
        });
        setInstantRevealAssistantIds((current) => {
          if (current.has(assistantId)) return current;
          const next = new Set(current);
          next.add(assistantId);
          return next;
        });
        if (activeVoicePreviewIdRef.current === assistantId) {
          activeVoicePreviewIdRef.current = null;
          setActiveVoicePreviewId(null);
        }
        afterRelease?.();
      };

      if (immediate) {
        release();
        return;
      }

      voiceCommitTimerRef.current = setTimeout(release, VOICE_POST_SPEECH_HOLD_MS);
    },
    [clearVoiceCommitTimer]
  );

  const clickVoiceAction = useCallback((action: VoiceResolvedAction): boolean => {
    if (typeof document === "undefined") return false;

    const rootSelector = `[data-message-id="${action.messageId}"]`;
    const getRoot = () => document.querySelector<HTMLElement>(rootSelector);
    const root = getRoot();
    if (!root) return false;

    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s&]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const transcriptNormalized = normalize(action.buttonLabels.join(" "));
    const candidates = action.buttonLabels.map(normalize).filter(Boolean);

    const findMatch = (scope: ParentNode) => {
      const scopedButtons = Array.from(scope.querySelectorAll<HTMLButtonElement>("button"));
      for (const button of scopedButtons) {
        const text = normalize(button.textContent || "");
        if (!text) continue;
        if (candidates.some((candidate) => text === candidate || text.includes(candidate) || candidate.includes(text))) {
          return button;
        }
        if (transcriptNormalized && (text.includes(transcriptNormalized) || transcriptNormalized.includes(text))) {
          return button;
        }
      }
      return null;
    };

    if (action.clickCheckboxFirst) {
      const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (checkbox && !checkbox.checked) {
        checkbox.click();
      }
    }

    let target = findMatch(root);

    if (!target && action.clickFirstButtonIfDisabled) {
      target = buttons[0] || null;
    }

    if (!target) return false;

    if (action.clickCheckboxFirst || (target.disabled && action.clickFirstButtonIfDisabled)) {
      window.setTimeout(() => {
        const latestRoot = getRoot();
        if (!latestRoot) return;

        let latestTarget = findMatch(latestRoot);
        if (!latestTarget && action.clickFirstButtonIfDisabled) {
          latestTarget = Array.from(latestRoot.querySelectorAll<HTMLButtonElement>("button"))[0] || null;
        }

        if (latestTarget && !latestTarget.disabled) {
          latestTarget.click();
          return;
        }

        if (latestTarget && action.clickFirstButtonIfDisabled) {
          latestTarget.click();
        }
      }, 75);
      return true;
    }

    target.click();
    return true;
  }, []);

  const dispatchVoiceFallback = useCallback((visibleText: string, systemText?: string) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("mock-send-message", {
        detail: {
          visibleText,
          ...(systemText ? { systemText } : {}),
        },
      })
    );
  }, []);

  const executeVoiceAction = useCallback(
    (action: VoiceResolvedAction, transcriptText: string): boolean => {
      const clicked = clickVoiceAction(action);
      if (clicked) return true;

      if (action.fallbackSystemText || action.fallbackVisibleText) {
        dispatchVoiceFallback(action.fallbackVisibleText || transcriptText, action.fallbackSystemText);
        return true;
      }

      return false;
    },
    [clickVoiceAction, dispatchVoiceFallback]
  );

  const handleAccountSelectorVoiceSelection = useCallback((messageId: string | undefined, transcript: string): boolean => {
    if (!messageId || typeof document === "undefined") return false;

    const root = document.querySelector<HTMLElement>(
      `[data-widget-name="AccountSelectorWidget"][data-widget-message-id="${messageId}"]`
    );
    if (!root || root.offsetParent === null) return false;

    const normalized = normalizeVoiceEchoText(transcript);
    const manualInput = root.querySelector<HTMLInputElement>('input[type="text"]');
    const manualVisible = Boolean(manualInput && manualInput.offsetParent !== null);
    const submitButton = root.querySelector<HTMLButtonElement>('[data-account-submit="true"]');
    const manualEntryButton = root.querySelector<HTMLButtonElement>('[data-account-manual-entry="true"]');
    const validateButton = root.querySelector<HTMLButtonElement>('[data-account-validate="true"]');
    const backButton = root.querySelector<HTMLButtonElement>('[data-account-back="true"]');
    const optionButtons = Array.from(
      root.querySelectorAll<HTMLButtonElement>('[data-account-option="true"]')
    );

    const speakAccountPrompt = (text: string) => {
      window.dispatchEvent(new CustomEvent(VOICE_WIDGET_PROMPT_EVENT, { detail: { text } }));
    };

    const commitIntent = includesVoicePhrase(normalized, [
      "use this account",
      "use selected account",
      "continue with this account",
      "continue with selected account",
      "proceed with this account",
      "proceed with selected account",
      "select and continue",
    ]) || /\b(use|continue|proceed)\b/.test(normalized);

    if (manualVisible && includesVoicePhrase(normalized, ["back to existing accounts", "back to existing account", "go back"])) {
      backButton?.click();
      return true;
    }

    if (!manualVisible && includesVoicePhrase(normalized, ["enter iban manually", "manual iban", "manual entry"])) {
      manualEntryButton?.click();
      return true;
    }

    const explicitIban = extractIbanFromVoiceTranscript(transcript)?.replace(/\s/g, "");
    if (manualVisible && manualInput && explicitIban) {
      manualInput.focus();
      manualInput.value = explicitIban;
      manualInput.dispatchEvent(new Event("input", { bubbles: true }));

      if (validateButton && !validateButton.disabled) {
        window.setTimeout(() => validateButton.click(), 60);
      }
      return true;
    }

    if (manualVisible && includesVoicePhrase(normalized, ["validate iban", "verify iban"])) {
      if (validateButton && !validateButton.disabled) {
        validateButton.click();
        return true;
      }
    }

    if (commitIntent && submitButton && !submitButton.disabled) {
      submitButton.click();
      return true;
    }

    if (optionButtons.length === 0) return false;

    const accountSignalsDetected =
      Boolean(explicitIban) ||
      extractOrdinalAccountIndex(normalized) !== null ||
      includesVoicePhrase(normalized, [
        "account",
        "iban",
        "bank",
        "beneficiary",
        "select",
        "choose",
        "use",
        "ending",
        "last",
      ]);

    const suffixMatch = normalized.match(/(?:ending|ends?\s+with|last)\s+(\d{4,6})\b/i);
    const requestedSuffix = suffixMatch?.[1] || null;
    const ordinalIndex = extractOrdinalAccountIndex(normalized);

    const scoredMatches = optionButtons
      .map((button) => {
        const cleanIban = (button.dataset.accountIban || "").replace(/\s/g, "").toUpperCase();
        const bank = normalizeVoiceEchoText(button.dataset.accountBank || "");
        const beneficiary = normalizeVoiceEchoText(button.dataset.accountBeneficiary || "");
        const accountType = normalizeVoiceEchoText(button.dataset.accountType || "");
        const last4 = button.dataset.accountLast4 || "";
        const last6 = button.dataset.accountLast6 || "";
        const index = Number(button.dataset.accountIndex || "-1");

        let score = 0;
        if (explicitIban && cleanIban === explicitIban.toUpperCase()) score = Math.max(score, 100);
        if (requestedSuffix && (last4 === requestedSuffix || last6 === requestedSuffix)) score = Math.max(score, 90);
        if (ordinalIndex !== null && ordinalIndex === index) score = Math.max(score, 80);
        if (bank && normalized.includes(bank)) score = Math.max(score, 70);
        if (beneficiary && normalized.includes(beneficiary)) score = Math.max(score, 65);
        if (accountType && normalized.includes(accountType)) score = Math.max(score, 50);

        return { button, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scoredMatches.length === 0) {
      if (accountSignalsDetected) {
        speakAccountPrompt("Please say the first account, the bank name, or the last four digits of the IBAN.");
        return true;
      }
      return false;
    }

    const topScore = scoredMatches[0]?.score ?? 0;
    const topMatches = scoredMatches.filter((item) => item.score === topScore);
    if (topMatches.length !== 1) {
      speakAccountPrompt("I found multiple matching accounts. Please say the bank name or the last four digits of the IBAN.");
      return true;
    }

    topMatches[0].button.click();

    if (commitIntent && submitButton) {
      window.setTimeout(() => {
        const latestSubmitButton = root.querySelector<HTMLButtonElement>('[data-account-submit="true"]');
        if (latestSubmitButton && !latestSubmitButton.disabled) {
          latestSubmitButton.click();
        }
      }, 75);
    }

    return true;
  }, []);

  const flushPendingVoiceInteraction = useCallback(
    (messageId?: string, widgetShown = false) => {
      const pending = pendingVoiceInteractionRef.current;
      if (!pending) return false;
      if (messageId && pending.messageId !== messageId) return false;
      if (pending.needsWidget && !widgetShown) return false;

      if (pending.action) {
        const handled = executeVoiceAction(pending.action, pending.text);
        if (handled) {
          pendingVoiceInteractionRef.current = null;
          return true;
        }
        return false;
      }

      sendMessage({ text: pending.text });
      pendingVoiceInteractionRef.current = null;
      return true;
    },
    [executeVoiceAction, sendMessage]
  );

  const handleWidgetShown = useCallback(
    (messageId: string) => {
      if (!pendingVoiceInteractionRef.current) return;
      if (pendingVoiceInteractionRef.current.messageId !== messageId) return;
      flushPendingVoiceInteraction(messageId, true);
    },
    [flushPendingVoiceInteraction]
  );

  const dispatchMockMessage = useCallback((detail: unknown) => {
    if (typeof detail === "string") {
      sendMessage({ text: detail });
      return;
    }

    if (detail && typeof detail === "object") {
      const visibleText =
        typeof (detail as { visibleText?: unknown }).visibleText === "string"
          ? ((detail as { visibleText: string }).visibleText || "").trim()
          : "";
      const systemText =
        typeof (detail as { systemText?: unknown }).systemText === "string"
          ? ((detail as { systemText: string }).systemText || "").trim()
          : "";

      if (visibleText) {
        setMessages((prev) => [
          ...prev,
          {
            id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            role: "user",
            parts: [{ type: "text", text: visibleText }],
          } as UIMessage,
        ]);
      }

      if (systemText) {
        sendMessage({ text: systemText });
      } else if (visibleText) {
        sendMessage({ text: visibleText });
      }
    }
  }, [sendMessage, setMessages]);

  const latestOptionPrompt = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === "assistant" && ((message.metadata as { options?: unknown[] } | undefined)?.options?.length ?? 0) > 0),
    [messages]
  );

  const lastAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant') as
    | (UIMessage & { metadata?: { allow_upload?: boolean } })
    | undefined,
    [messages]
  );
  const lastAssistantText = useMemo(() => getMessageText(lastAssistant), [lastAssistant]);
  const allowUpload = Boolean(lastAssistant?.metadata?.allow_upload);
  const bufferedAssistant = useMemo(
    () =>
      [...messages].reverse().find(
        (message) => message.role === "assistant" && bufferedAssistantIds.has(message.id)
      ) as (UIMessage & { metadata?: { allow_upload?: boolean } }) | undefined,
    [messages, bufferedAssistantIds]
  );

  const onTranscript = useCallback((text: string) => {
    if (voiceModeRef.current && voiceModeOpen && isAssistantSpeechEcho(text)) {
      setLastVoiceUserText("");
      resetToIdleRef.current?.();
      if (!isLoading) {
        window.setTimeout(() => {
          if (!voiceModeRef.current || !voiceModeOpen || isLoading) return;
          startListeningRef.current?.();
        }, 300);
      }
      return;
    }

    const activeAssistant = bufferedAssistant || lastAssistant;
    const activeWidgetName = getMessageWidgetName(activeAssistant);

    if (voiceModeRef.current && voiceModeOpen) {
      if (activeWidgetName === "AccountSelectorWidget") {
        const accountSelectorHandled = handleAccountSelectorVoiceSelection(activeAssistant?.id, text);
        if (accountSelectorHandled) {
          pendingVoiceInteractionRef.current = null;
          resetToIdleRef.current?.();
          setLastVoiceUserText(text);
          return;
        }
      }

      const widgetUpdate = resolveVisibleVoiceWidgetUpdate(
        activeAssistant?.id,
        isEditableVoiceWidget(activeWidgetName) ? activeWidgetName : null,
        text
      );
      if (widgetUpdate) {
        const spokenIncomeValue =
          widgetUpdate.widget === "ModifyIncomeWidget" && typeof widgetUpdate.updates.monthlyIncome === "string"
            ? Number(widgetUpdate.updates.monthlyIncome.replace(/\D/g, "") || "0")
            : null;
        const incomeUpdateWillAutoSave =
          widgetUpdate.widget === "ModifyIncomeWidget" &&
          spokenIncomeValue !== null &&
          spokenIncomeValue >= 5000 &&
          spokenIncomeValue <= 200000;

        dispatchVoiceWidgetFieldUpdate(widgetUpdate);
        pendingVoiceInteractionRef.current = null;
        resetToIdleRef.current?.();
        autoListenAfterSpeechRef.current = false;
        activeVoicePreviewIdRef.current = null;
        setActiveVoicePreviewId(null);
        setLastVoiceUserText("");
        if (incomeUpdateWillAutoSave) {
          autoListenAfterSpeechRef.current = false;
          setVoicePanelText("Saving updated income details.");
          return;
        }

        setVoicePanelText(VOICE_WIDGET_UPDATE_PROMPT);
        rememberAssistantSpeechForEchoGuard(VOICE_WIDGET_UPDATE_PROMPT);
        speakRef.current?.(VOICE_WIDGET_UPDATE_PROMPT, {
          onEnd: () => {
            autoListenAfterSpeechRef.current = false;
          },
          onError: () => {
            autoListenAfterSpeechRef.current = false;
          },
        });
        return;
      }
    }

    if (voiceModeRef.current) {
      setLastVoiceUserText(text);
    }

    const voiceAction = resolveVoiceJourneyAction(activeAssistant, latestOptionPrompt, text);
    const forceEligibleOfferContinue =
      activeWidgetName === "EligibleOfferWidget" && isEligibleOfferContinuationTranscript(text);

    if (voiceModeRef.current && bufferedAssistant && activeAssistant) {
      pendingVoiceInteractionRef.current = {
        text,
        messageId: activeAssistant.id,
        action:
          voiceAction ||
          (forceEligibleOfferContinue
            ? {
                messageId: activeAssistant.id,
                buttonLabels: ["Review Details & Proceed"],
                fallbackVisibleText: "Continue",
                fallbackSystemText: "__SYS__continue",
              }
            : null),
        needsWidget: hasMessageWidget(activeAssistant),
      };
      return;
    }

    if (voiceAction) {
      const handled = executeVoiceAction(voiceAction, text);
      if (handled) {
        resetToIdleRef.current?.();
        resolvedVoicePromptIdsRef.current.add(voiceAction.messageId);
        if (voiceModeRef.current) {
          setLastVoiceUserText(text);
        }
        return;
      }
    }

    if (voiceModeRef.current && activeAssistant && forceEligibleOfferContinue) {
      dispatchVoiceFallback("Continue", "__SYS__continue");
      resetToIdleRef.current?.();
      resolvedVoicePromptIdsRef.current.add(activeAssistant.id);
      setLastVoiceUserText(text);
      return;
    }

    if (voiceModeRef.current) {
      setLastVoiceUserText(text);
    }
    sendMessage({ text });
  }, [
    activeVoicePreviewIdRef,
    bufferedAssistant,
    dispatchVoiceFallback,
    executeVoiceAction,
    isAssistantSpeechEcho,
    isLoading,
    lastAssistant,
    latestOptionPrompt,
    pendingVoiceInteractionRef,
    rememberAssistantSpeechForEchoGuard,
    sendMessage,
    setActiveVoicePreviewId,
    setLastVoiceUserText,
    setVoicePanelText,
    handleAccountSelectorVoiceSelection,
    voiceModeOpen,
  ]);

  const { voiceState, interimText, supported, error: voiceError, clearError, toggleVoice, resetToIdle, speak, startListening, stopListening } = useVoice({
    language: "en-US",
    ttsEnabled: true,
    onTranscript,
  });

  useEffect(() => {
    speakRef.current = speak;
    startListeningRef.current = startListening;
    resetToIdleRef.current = resetToIdle;
  }, [resetToIdle, speak, startListening]);

  const startVoicePreview = useCallback(
    (assistantId: string, previewText: string, speechText: string) => {
      clearVoiceLifecycleTimers();

      const generation = voiceCommitGenerationRef.current + 1;
      voiceCommitGenerationRef.current = generation;
      let speechFinished = false;
      let minimumSpeechTimePassed = false;
      let commitQueued = false;

      const commitIfReady = () => {
        if (commitQueued) return;
        if (voiceCommitGenerationRef.current !== generation) return;
        if (activeVoicePreviewIdRef.current !== assistantId) return;
        if (!speechFinished || !minimumSpeechTimePassed) return;

        commitQueued = true;
        commitVoicePreview(assistantId, false, () => {
          const handled = flushPendingVoiceInteraction(assistantId);
          if (!handled && pendingVoiceInteractionRef.current?.action) {
            window.setTimeout(() => {
              flushPendingVoiceInteraction(assistantId);
            }, 75);
          }
          autoListenAfterSpeechRef.current = false;
        });
      };

      const markSpeechFinished = () => {
        speechFinished = true;
        commitIfReady();
      };

      const estimatedSpeechMs = estimateVoiceSpeechMs(speechText);
      voiceSpeechMinTimerRef.current = setTimeout(() => {
        minimumSpeechTimePassed = true;
        voiceSpeechMinTimerRef.current = null;
        commitIfReady();
      }, estimatedSpeechMs);

      voiceSpeechFailsafeTimerRef.current = setTimeout(() => {
        speechFinished = true;
        minimumSpeechTimePassed = true;
        voiceSpeechFailsafeTimerRef.current = null;
        commitIfReady();
      }, estimatedSpeechMs + VOICE_TTS_FAILSAFE_EXTRA_MS);

      setVoicePanelText(previewText);
      setLastVoiceUserText("");
      rememberAssistantSpeechForEchoGuard(speechText);
      speak(speechText, {
        onEnd: markSpeechFinished,
        onError: markSpeechFinished,
      });
    },
    [clearVoiceLifecycleTimers, commitVoicePreview, flushPendingVoiceInteraction, rememberAssistantSpeechForEchoGuard, speak]
  );

  const displayMessages = useMemo(
    () =>
      messages.filter(
        (message) => {
          if (message.role !== "assistant") return true;
          if (bufferedAssistantIds.has(message.id)) return false;
          if (!voiceModeOpen) return true;
          if (instantRevealAssistantIds.has(message.id)) return true;
          if (activeVoicePreviewId === message.id) return false;
          return knownMessageIds.has(message.id);
        }
      ),
    [messages, activeVoicePreviewId, bufferedAssistantIds, instantRevealAssistantIds, knownMessageIds, voiceModeOpen]
  );

  const chatWindowMessages = useMemo(
    () => displayMessages.map(toChatWindowMessage),
    [displayMessages]
  );

  // Auto-speak new assistant messages when in voice mode, and reset processing state
  useEffect(() => {
    messages.forEach((message) => {
      if (knownMessageIdsRef.current.has(message.id)) return;

      if (message.role !== "assistant") {
        knownMessageIdsRef.current.add(message.id);
        setKnownMessageIds((current) => {
          if (current.has(message.id)) return current;
          const next = new Set(current);
          next.add(message.id);
          return next;
        });
        return;
      }

      if (voiceModeRef.current && isLoading) return;

      knownMessageIdsRef.current.add(message.id);
      setKnownMessageIds((current) => {
        if (current.has(message.id)) return current;
        const next = new Set(current);
        next.add(message.id);
        return next;
      });

      resetToIdle();

      const text = getMessageText(message);
      if (!text.trim()) return;

      if (voiceModeRef.current && voiceModeOpen) {
        const { previewText, speechText } = getVoiceSpeechContent(message);

        setBufferedAssistantIds((current) => {
          const next = new Set(current);
          next.add(message.id);
          return next;
        });
        activeVoicePreviewIdRef.current = message.id;
        setActiveVoicePreviewId(message.id);
        spokenAssistantIdsRef.current.add(message.id);
        autoListenAfterSpeechRef.current = false;
        voiceModeRef.current = true;
        startVoicePreview(message.id, previewText, speechText);
        return;
      }

      if (voiceModeRef.current && !voiceModeOpen) {
        const speechText = buildVoiceSpeechText(text);
        rememberAssistantSpeechForEchoGuard(speechText);
        speak(speechText);
      }
    });
  }, [isLoading, messages, rememberAssistantSpeechForEchoGuard, resetToIdle, speak, startVoicePreview, voiceModeOpen]);

  // Auto-clear voice errors after 5 seconds
  useEffect(() => {
    if (!voiceError) return;
    const t = setTimeout(clearError, 5000);
    return () => clearTimeout(t);
  }, [voiceError, clearError]);

  // Track voice mode: on when user taps mic, off when they type
  const handleToggleVoice = () => {
    voiceModeRef.current = true;
    toggleVoice();
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    voiceModeRef.current = false; // Switch to text mode
    sendMessage({ text: input });
    setInput('');
  };

  useEffect(() => {
    const handleMockMessage = (e: Event) => {
      dispatchMockMessage((e as CustomEvent).detail);
    };
    window.addEventListener('mock-send-message', handleMockMessage);
    return () => window.removeEventListener('mock-send-message', handleMockMessage);
  }, [dispatchMockMessage]);

  const chatWindowIsLoading = isLoading && !voiceModeOpen;
  const voiceModeSpeaker = voiceState === "speaking" || Boolean(activeVoicePreviewId) ? "ai" : "user";
  const voiceModeText =
    voiceModeSpeaker === "ai"
      ? voicePanelText || getMessageText(bufferedAssistant) || lastAssistantText || "I am ready when you are."
      : interimText || lastVoiceUserText || "I am listening.";

  useEffect(() => {
    if (!voiceModeOpen || isLoading) return;

    const assistantToSpeak = bufferedAssistant || lastAssistant;
    const assistantText = getMessageText(assistantToSpeak);
    if (!assistantToSpeak || !assistantText) return;
    if (resolvedVoicePromptIdsRef.current.has(assistantToSpeak.id)) return;
    if (spokenAssistantIdsRef.current.has(assistantToSpeak.id)) return;

    const { previewText, speechText } = getVoiceSpeechContent(assistantToSpeak);
    spokenAssistantIdsRef.current.add(assistantToSpeak.id);
    activeVoicePreviewIdRef.current = bufferedAssistant ? assistantToSpeak.id : null;
    setActiveVoicePreviewId(bufferedAssistant ? assistantToSpeak.id : null);
    autoListenAfterSpeechRef.current = false;
    voiceModeRef.current = true;
    if (bufferedAssistant) {
      const previewStartTimer = window.setTimeout(() => {
        startVoicePreview(assistantToSpeak.id, previewText, speechText);
      }, 0);
      return () => clearTimeout(previewStartTimer);
    }

    clearVoiceLifecycleTimers();
    const generation = voiceCommitGenerationRef.current + 1;
    voiceCommitGenerationRef.current = generation;
    const speechStartTimer = window.setTimeout(() => {
      setVoicePanelText(previewText);
      setLastVoiceUserText("");

      const markSpeechFinished = () => {
        autoListenAfterSpeechRef.current = false;
      };

      const estimatedSpeechMs = estimateVoiceSpeechMs(speechText);
      voiceSpeechMinTimerRef.current = setTimeout(() => {
        voiceSpeechMinTimerRef.current = null;
      }, estimatedSpeechMs);

      voiceSpeechFailsafeTimerRef.current = setTimeout(() => {
        voiceSpeechFailsafeTimerRef.current = null;
        autoListenAfterSpeechRef.current = false;
      }, estimatedSpeechMs + VOICE_TTS_FAILSAFE_EXTRA_MS);

      rememberAssistantSpeechForEchoGuard(speechText);
      speak(speechText, {
        onEnd: markSpeechFinished,
        onError: markSpeechFinished,
      });
    }, 0);

    return () => clearTimeout(speechStartTimer);
  }, [bufferedAssistant, clearVoiceLifecycleTimers, isLoading, lastAssistant, rememberAssistantSpeechForEchoGuard, speak, startVoicePreview, voiceModeOpen]);

  const handleUploadClick = () => {
    if (!allowUpload) return;
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    sendMessage({ text: `__SYS__document_uploaded:${file.name}` });
    e.target.value = '';
  };

  const handleOpenVoiceMode = () => {
    voiceModeRef.current = true;
    setVoiceModeOpen(true);
  };

  const handleVoiceModeMicToggle = () => {
    voiceModeRef.current = true;
    toggleVoice();
  };

  const handleCloseVoiceMode = () => {
    autoListenAfterSpeechRef.current = false;
    voiceCommitGenerationRef.current += 1;
    clearVoiceLifecycleTimers();
    const previewAssistantId = activeVoicePreviewIdRef.current;
    commitVoicePreview(previewAssistantId, true);
    voiceModeRef.current = false;
    pendingVoiceInteractionRef.current = null;
    window.speechSynthesis?.cancel();
    stopListening();
    setVoiceModeOpen(false);
  };

  const handleLogout = async () => {
    setShowHeaderMenu(false);
    autoListenAfterSpeechRef.current = false;
    voiceModeRef.current = false;
    voiceCommitGenerationRef.current += 1;
    clearVoiceLifecycleTimers();
    commitVoicePreview(activeVoicePreviewIdRef.current, true);
    pendingVoiceInteractionRef.current = null;
    window.speechSynthesis?.cancel();
    stopListening();

    try {
      await fetch("/customer_agent/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } finally {
      router.replace("/login");
    }
  };

  useEffect(() => {
    return () => {
      clearVoiceLifecycleTimers();
    };
  }, [clearVoiceLifecycleTimers]);

  useEffect(() => {
    document.documentElement.dataset.voiceModeOpen = voiceModeOpen ? "true" : "false";
    return () => {
      if (document.documentElement.dataset.voiceModeOpen === "true" && !voiceModeOpen) {
        document.documentElement.dataset.voiceModeOpen = "false";
      }
    };
  }, [voiceModeOpen]);

  useEffect(() => {
    const handleVoiceWidgetPrompt = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      const text = typeof detail?.text === "string" ? detail.text.trim() : "";
      if (!text || !voiceModeRef.current || !voiceModeOpen) return;

      setVoicePanelText(text);
      setLastVoiceUserText("");
      autoListenAfterSpeechRef.current = false;
      rememberAssistantSpeechForEchoGuard(text);
      speakRef.current?.(text, {
        onEnd: () => {},
        onError: () => {},
      });
    };

    window.addEventListener(VOICE_WIDGET_PROMPT_EVENT, handleVoiceWidgetPrompt);
    return () => window.removeEventListener(VOICE_WIDGET_PROMPT_EVENT, handleVoiceWidgetPrompt);
  }, [rememberAssistantSpeechForEchoGuard, voiceModeOpen]);

  return (
    <SpeakContext.Provider value={speak}>
    <div className="flex flex-col h-full bg-white relative">
      <div className="absolute top-0 left-0 w-full z-10 bg-white/70 backdrop-blur-xl shadow-[0_8px_24px_-18px_rgba(15,23,42,0.45)] relative">
        <div className="px-4 py-3.5 flex items-center gap-3">
          <div className="h-10 w-10  bg-white/85  flex items-center justify-center shrink-0">
            <Image
              src="/customer_agent/assets/newgen_logo.png"
              alt="Newgen"
              width={28}
              height={28}
              className="h-7 w-auto object-contain"
              priority
            />
          </div>
          <div className="min-w-0">
            <h2 className="type-display-sm text-slate-900 capitalize truncate">
              {product.replace('_', ' ')}
            </h2>
            <p className="type-overline pt-1 text-slate-500">Agentic Finance Advisor</p>
          </div>
          <div className="relative ml-auto flex items-center gap-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowHeaderMenu((open) => !open)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-orange-50"
                aria-label="Open profile details"
                title="Profile Details"
              >
                <Image
                  src="/customer_agent/assets/header_user_details.png"
                  alt=""
                  width={30}
                  height={28}
                  className="h-6 w-6 object-contain"
                />
              </button>
              {showHeaderMenu && (
                <div className="absolute right-0 top-11 z-30 w-[min(calc(100vw-24px),350px)] max-h-[calc(100dvh-96px)] overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200 bg-white p-3 shadow-[0_12px_28px_-18px_rgba(15,23,42,0.55)] hide-scrollbar">
                  {latestPersonalDetails ? (
                    <div className="w-full [&>*]:max-w-full">
                      <PersonalDetailsWidget data={latestPersonalDetails} />
                    </div>
                  ) : (
                    <div className="text-center py-6 px-4 text-slate-500 text-sm font-medium bg-slate-50 rounded-lg border border-slate-100">
                      No personal details available yet. Please complete the verification process first.
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-[#C24231]"
              aria-label="Logout"
              title="Logout"
            >
              <LogOut className="h-[22px] w-[22px]" />
            </button>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-[#FB8B23] to-[#C24231]" />
      </div>

      <div className={voiceModeOpen ? "flex-1 overflow-hidden pt-0 pb-[300px]" : "flex-1 overflow-hidden pt-0 pb-24"}>
        <ChatWindow
          messages={chatWindowMessages}
          isLoading={chatWindowIsLoading}
          forceVisibleAssistantIds={[...instantRevealAssistantIds]}
          onWidgetShown={handleWidgetShown}
        />
      </div>

      {/* Input Area */}
      <div className={voiceModeOpen ? "absolute bottom-0 left-0 w-full bg-white" : "absolute bottom-0 left-0 w-full p-4 bg-white shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)]"}>
        {/* Voice error banner */}
        {voiceError && (
          <div className="mb-2 px-4 py-2 bg-red-50 border border-red-200 rounded-xl type-body-md-strong text-red-700 flex justify-between items-center">
            <span>{voiceError}</span>
            <button onClick={clearError} className="ml-2 text-red-400 hover:text-red-600 font-bold">&times;</button>
          </div>
        )}
        {/* Interim voice transcript */}
        {!voiceModeOpen && interimText && (
          <div className="mb-2 px-4 py-2 bg-blue-50 rounded-xl type-body-md-strong text-blue-700 italic animate-pulse">
            🎙 {interimText}
          </div>
        )}
        {voiceModeOpen ? (
          <VoiceModePanel
            displayText={voiceModeText}
            mode={voiceModeSpeaker}
            voiceState={voiceState}
            allowUpload={allowUpload}
            isLoading={isLoading}
            onUpload={handleUploadClick}
            onFileSelect={handleFileSelect}
            onMicToggle={handleVoiceModeMicToggle}
            onClose={handleCloseVoiceMode}
            fileInputRef={fileInputRef}
          />
        ) : (
          <ChatInputBar
            input={input || ''}
            isLoading={isLoading}
            allowUpload={allowUpload}
            voiceState={voiceState}
            supported={supported}
            onInputChange={setInput}
            onSubmit={onSubmit}
            onUpload={handleUploadClick}
            onFileSelect={handleFileSelect}
            onDictationToggle={handleToggleVoice}
            onOpenVoiceMode={handleOpenVoiceMode}
            fileInputRef={fileInputRef}
          />
        )}
      </div>
    </div>
    </SpeakContext.Provider>
  );
}
