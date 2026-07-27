"use client";

import React, { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpeakContext } from "@/hooks/SpeakContext";
import { getFemaleVoice } from "@/lib/voice";
import { OptionButtons } from "./OptionButtons";
import { NafathWidget } from "../widgets/NafathWidget";
import { OfferSliderWidget } from "../widgets/OfferSliderWidget";
import { SuccessWidget } from "../widgets/SuccessWidget";
import { WelcomeWidget } from "../widgets/WelcomeWidget";
import { LoadingWidget } from "../widgets/LoadingWidget";
import { VerificationSuccessWidget } from "../widgets/VerificationSuccessWidget";
import { PersonalDetailsWidget } from "../widgets/PersonalDetailsWidget";
import { EligibleOfferWidget } from "../widgets/EligibleOfferWidget";
import { FinanceSummaryWidget } from "../widgets/FinanceSummaryWidget";
import { DocumentPreviewWidget } from "../widgets/DocumentPreviewWidget";
import { GenerateContractWidget } from "../widgets/GenerateContractWidget";
import { OtpVerificationWidget } from "../widgets/OtpVerificationWidget";
import { AccountSelectorWidget } from "../widgets/AccountSelectorWidget";
import { DisbursementWidget } from "../widgets/DisbursementWidget";
import { NTBIntroductionWidget } from "../widgets/NTBIntroductionWidget";
import { ExpensesWidget } from "../widgets/ExpensesWidget";
import { IncomeProofChoiceWidget } from "../widgets/IncomeProofChoiceWidget";
import { UpdatingWidget } from "../widgets/UpdatingWidget";
import { ModifySectionWidget } from "../widgets/ModifySectionWidget";
import { ModifyPersonalWidget } from "../widgets/ModifyPersonalWidget";
import { ModifyAddressWidget } from "../widgets/ModifyAddressWidget";
import { ModifyEmploymentWidget } from "../widgets/ModifyEmploymentWidget";
import { ModifyIncomeWidget } from "../widgets/ModifyIncomeWidget";
import { EligibilityCheckWidget } from "../widgets/EligibilityCheckWidget";
import { WantsMoreDecisionWidget } from "../widgets/WantsMoreDecisionWidget";
import { HigherAmountReviewWidget } from "../widgets/HigherAmountReviewWidget";
import { BackofficeWorkitemWidget } from "../widgets/BackofficeWorkitemWidget";
import { ApplicationSummaryWidget } from "../widgets/ApplicationSummaryWidget";
import { FinalIVRConsentWidget } from "../widgets/FinalIVRConsentWidget";
import { IBANValidationWidget } from "../widgets/IBANValidationWidget";
import { CommodityTradeAuthorizationWidget } from "../widgets/CommodityTradeAuthorizationWidget";
import { PreApprovedOfferWidget } from "../widgets/PreApprovedOfferWidget";
import { DelayTriggerWidget } from "../widgets/DelayTriggerWidget";
import { StepIndicator } from "../widgets/StepIndicator";
import { ImportantText } from "../shared/ImportantText";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WidgetData = any;

type StepTrackerWidgetData = {
  show_step_tracker?: boolean;
  tracker_step?: number;
  tracker_total?: number;
};

export interface WidgetSpec {
  widget: string;
  data?: WidgetData;
}

export interface MessagePart {
  type?: string;
  text?: string;
  data?: unknown;
}

export interface MessageMetadata {
  widget?: unknown;
  options?: Array<{ id: string; label: string; value: string }>;
  optionContext?: { type?: string; field?: string };
  postText?: string;
}

type WidgetComponent = React.ComponentType<{ data?: WidgetData; messageId?: string; widgetName?: string }>;

const WIDGET_REGISTRY: Record<string, WidgetComponent> = {
  NafathWidget,
  OfferSliderWidget,
  SuccessWidget,
  WelcomeWidget,
  LoadingWidget,
  VerificationSuccessWidget,
  PersonalDetailsWidget,
  EligibleOfferWidget,
  FinanceSummaryWidget,
  DocumentPreviewWidget,
  GenerateContractWidget,
  OtpVerificationWidget,
  AccountSelectorWidget,
  DisbursementWidget,
  NTBIntroductionWidget,
  ExpensesWidget,
  IncomeProofChoiceWidget,
  UpdatingWidget,
  ModifySectionWidget,
  ModifyPersonalWidget,
  ModifyAddressWidget,
  ModifyEmploymentWidget,
  ModifyIncomeWidget,
  EligibilityCheckWidget,
  WantsMoreDecisionWidget,
  HigherAmountReviewWidget,
  BackofficeWorkitemWidget,
  ApplicationSummaryWidget,
  FinalIVRConsentWidget,
  IBANValidationWidget,
  CommodityTradeAuthorizationWidget,
  PreApprovedOfferWidget,
  DelayTriggerWidget,
};

export interface MessageBubbleProps {
  messageId?: string;
  role: "user" | "assistant";
  content?: string;
  parts?: MessagePart[];
  metadata?: MessageMetadata;
  showWidget?: boolean;
  onWidgetShown?: (element: HTMLDivElement) => void;
}

/** Render lightweight markdown: lists, bold, italic, and inline code. */
function renderInlineMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: "ol" | "ul" | null = null;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const ListTag = listType;
      elements.push(
        <ListTag
          key={`list-${elements.length}`}
          className={
            listType === "ol"
              ? "list-decimal pl-5 space-y-1 my-1"
              : "list-disc pl-5 space-y-1 my-1"
          }
        >
          {listItems}
        </ListTag>
      );
      listItems = [];
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    const ulMatch = trimmed.match(/^[-*•+]\s+(.+)/);

    if (olMatch) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(<li key={`li-${i}`}>{renderInlineSpans(olMatch[2])}</li>);
    } else if (ulMatch) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(<li key={`li-${i}`}>{renderInlineSpans(ulMatch[1])}</li>);
    } else {
      flushList();
      if (trimmed === "") {
        if (elements.length > 0) {
          elements.push(<div key={`br-${i}`} className="h-2" />);
        }
      } else if (/^#{1,3}\s+/.test(trimmed)) {
        const heading = trimmed.replace(/^#{1,3}\s+/, "");
        elements.push(
          <p key={`h-${i}`} className="my-1 text-[15px] font-semibold text-[#0D141A]">
            {renderInlineSpans(heading)}
          </p>
        );
      } else {
        elements.push(
          <p key={`p-${i}`} className="my-0.5 whitespace-pre-wrap break-words leading-6">
            {renderInlineSpans(trimmed)}
          </p>
        );
      }
    }
  }

  flushList();
  return <>{elements}</>;
}

/** Render inline spans: **bold**, *italic*, `code` within a single line. */
function renderInlineSpans(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<ImportantText key={`t-${match.index}`} text={text.slice(lastIndex, match.index)} />);
    }

    if (match[2]) {
      parts.push(
        <strong key={match.index} className="font-bold">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      parts.push(<em key={match.index}>{match[3]}</em>);
    } else if (match[4]) {
      parts.push(
        <code key={match.index} className="bg-slate-100 px-1 rounded text-[13px]">
          {match[4]}
        </code>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<ImportantText key={`t-end-${lastIndex}`} text={text.slice(lastIndex)} />);
  }

  return parts;
}

export function MessageBubble({ messageId, role, content, parts, metadata, showWidget = true, onWidgetShown }: MessageBubbleProps) {
  const isUser = role === "user";
  const speak = useSpeakContext();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const widgetRef = React.useRef<HTMLDivElement>(null);
  const widgetReportedRef = React.useRef(false);

  const displayText =
    content ||
    parts
      ?.filter((part) => part.type === "text")
      .map((part) => part.text)
      .filter(Boolean)
      .join("") ||
    "";

  let widgetSpec: WidgetSpec | null =
    metadata?.widget && typeof metadata.widget === "object" && "widget" in metadata.widget
      ? (metadata.widget as WidgetSpec)
      : null;

  if (!widgetSpec) {
    const widgetDataPart = parts?.find((part) => part.type === "data-widget");
    if (widgetDataPart?.data && typeof widgetDataPart.data === "object" && "widget" in widgetDataPart.data) {
      widgetSpec = widgetDataPart.data as WidgetSpec;
    }
  }

  if (!widgetSpec) {
    const widgetMatch = displayText.match(/<WIDGET_DATA>([\s\S]*?)<\/WIDGET_DATA>/);
    if (widgetMatch?.[1]) {
      try {
        widgetSpec = JSON.parse(widgetMatch[1]);
      } catch (error) {
        console.error("Failed to parse widget data", error);
      }
    }
  }

  const sanitizedText = displayText.replace(/<WIDGET_DATA>[\s\S]*?<\/WIDGET_DATA>/g, "").trim();
  const WidgetComponent = widgetSpec ? WIDGET_REGISTRY[widgetSpec.widget] : null;
  const widgetData = widgetSpec?.data as StepTrackerWidgetData | undefined;

  React.useEffect(() => {
    if (!WidgetComponent || !showWidget || !widgetRef.current || widgetReportedRef.current) return;
    widgetReportedRef.current = true;
    onWidgetShown?.(widgetRef.current);
  }, [WidgetComponent, onWidgetShown, showWidget]);

  if (
    isUser &&
    (sanitizedText.startsWith("__SYS__") ||
      sanitizedText.toLowerCase().startsWith("account_selected::") ||
      sanitizedText.toLowerCase().startsWith("iban_entered::"))
  ) {
    return null;
  }
  if (!sanitizedText && (!widgetSpec || !showWidget)) return null;

  const renderTextBlock = () =>
    sanitizedText && (
      <div
        className={cn(
          "max-w-[85%] px-5 py-3.5 rounded-[16px] shadow-sm whitespace-pre-wrap break-words",
          isUser
            ? "rounded-br-none text-[14px] leading-[16px] font-normal text-[#15212B]"
            : "rounded-bl-none type-body-md-strong text-slate-900"
        )}
        style={{
          backgroundImage: isUser
            ? "linear-gradient(90deg, #FB8B23 0%, #C24231 100%)"
            : "linear-gradient(90deg, #EBF4F5 0%, #B9DCF2 100%)",
        }}
      >
        {isUser ? sanitizedText : renderInlineMarkdown(sanitizedText)}
        {!isUser && speak && (
          <button
            onClick={handleSpeak}
            className="mt-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
            aria-label={isSpeaking ? "Stop speaking" : "Read aloud"}
          >
            {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}
      </div>
    );

  const renderOptions = () =>
    !isUser &&
    metadata?.options &&
    metadata.options.length > 0 && (
      <OptionButtons
        options={metadata.options}
        onSelect={(value) => {
          const field = metadata.optionContext?.field;
          if (metadata.optionContext?.type === "profile_completion" && field) {
            window.dispatchEvent(
              new CustomEvent("mock-send-message", {
                detail: {
                  visibleText: value,
                  systemText: `__SYS__PROFILE_COMPLETION: ${JSON.stringify({ field, value })}`,
                },
              })
            );
            return;
          }
          window.dispatchEvent(new CustomEvent("mock-send-message", { detail: value }));
        }}
      />
    );

  const renderPostText = () => {
    const postText = metadata?.postText?.trim();
    if (!postText || isUser) return null;

    return (
      <div
        className={cn("max-w-[85%] px-5 py-3.5 rounded-[16px] rounded-bl-none shadow-sm type-body-md-strong text-slate-900")}
        style={{
          backgroundImage: "linear-gradient(90deg, #EBF4F5 0%, #B9DCF2 100%)",
        }}
      >
        {renderInlineMarkdown(postText)}
        {speak && (
          <button
            onClick={handleSpeak}
            className="mt-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
            aria-label={isSpeaking ? "Stop speaking" : "Read aloud"}
          >
            {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}
      </div>
    );
  };

  const handleSpeak = () => {
    if (isSpeaking) {
      window.speechSynthesis?.cancel();
      setIsSpeaking(false);
      return;
    }

    if (!speak || !sanitizedText.trim()) return;

    const clean = sanitizedText.replace(/\*\*/g, "").replace(/[#_~`>]/g, "");
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    const UtteranceCtor =
      typeof window !== "undefined" ? window.SpeechSynthesisUtterance : undefined;
    if (!synth || !UtteranceCtor) return;

    let finished = false;
    let attemptCounter = 0;

    const finish = () => {
      if (finished) return;
      finished = true;
      setIsSpeaking(false);
    };

    const speakAttempt = (preferFemaleVoice: boolean) => {
      if (finished) return;
      attemptCounter += 1;
      const currentAttempt = attemptCounter;
      let started = false;

      let utterance: SpeechSynthesisUtterance;
      try {
        utterance = new UtteranceCtor(clean);
      } catch {
        finish();
        return;
      }

      utterance.lang = "en-US";
      if (preferFemaleVoice) {
        const femaleVoice = getFemaleVoice("en-US");
        if (femaleVoice) utterance.voice = femaleVoice;
      }

      utterance.pitch = 1.1;
      utterance.rate = 1.0;
      utterance.volume = 1;

      const startWatchdog = window.setTimeout(() => {
        if (finished || currentAttempt !== attemptCounter || started) return;
        if (preferFemaleVoice) {
          speakAttempt(false);
          return;
        }
        finish();
      }, 1200);

      const clearWatchdog = () => {
        clearTimeout(startWatchdog);
      };

      utterance.onstart = () => {
        if (finished || currentAttempt !== attemptCounter) return;
        started = true;
        clearWatchdog();
        setIsSpeaking(true);
      };

      utterance.onend = () => {
        if (finished || currentAttempt !== attemptCounter) return;
        clearWatchdog();
        finish();
      };

      utterance.onerror = () => {
        if (finished || currentAttempt !== attemptCounter) return;
        clearWatchdog();
        if (preferFemaleVoice) {
          speakAttempt(false);
          return;
        }
        finish();
      };

      try {
        synth.cancel();
        if (typeof synth.resume === "function") synth.resume();
        synth.speak(utterance);
      } catch {
        clearWatchdog();
        if (preferFemaleVoice) {
          speakAttempt(false);
          return;
        }
        finish();
      }
    };

    speakAttempt(true);
  };

  return (
    <div className={cn("flex flex-col w-full gap-2", isUser ? "items-end" : "items-start")} data-message-id={messageId}>
      {renderTextBlock()}
      {WidgetComponent && showWidget && (
        <div ref={widgetRef} className="w-full" data-widget-message-id={messageId} data-widget-name={widgetSpec?.widget || ""}>
          <StepIndicator
            show={widgetData?.show_step_tracker}
            currentStep={widgetData?.tracker_step}
            totalSteps={widgetData?.tracker_total}
          />
          <WidgetComponent data={widgetSpec?.data} messageId={messageId} widgetName={widgetSpec?.widget || ""} />
        </div>
      )}
      {renderPostText()}
      {renderOptions()}
    </div>
  );
}
