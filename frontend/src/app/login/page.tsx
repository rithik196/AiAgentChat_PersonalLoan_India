"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LandingChatBox } from "@/components/chat/LandingChatBox";
import type { ProductId } from "@/lib/productIntent";
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MessageSquare, Zap, ChevronDown, ArrowRight } from 'lucide-react';

type Stage = "phone" | "otp" | "product";

const GCC_COUNTRIES = [
  { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦', length: 10, placeholder: '5x xxx xxxx' },
  { code: '+971', name: 'UAE', flag: '🇦🇪', length: 9, placeholder: '5x xxx xxxx' },
  { code: '+973', name: 'Bahrain', flag: '🇧🇭', length: 8, placeholder: '3x xxx xxx' },
  { code: '+965', name: 'Kuwait', flag: '🇰🇼', length: 8, placeholder: '5x xxx xxx' },
  { code: '+968', name: 'Oman', flag: '🇴🇲', length: 8, placeholder: '9x xxx xxx' },
];

const getSpeechSynthesisSafe = (): SpeechSynthesis | null => {
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      return window.speechSynthesis;
    }
  } catch (err) {
    console.warn('speechSynthesis is not accessible in this context:', err);
  }
  return null;
};

const getSpeechSynthesisUtteranceSafe = (): typeof SpeechSynthesisUtterance | null => {
  try {
    if (typeof window !== 'undefined' && 'SpeechSynthesisUtterance' in window) {
      return window.SpeechSynthesisUtterance;
    }
  } catch (err) {
    console.warn('SpeechSynthesisUtterance is not accessible in this context:', err);
  }
  return null;
};

const productChoices = [
  { id: "cash_finance", label: "Cash Finance", desc: "Personal cash financing up to SAR 350K" },
  { id: "home_loan", label: "Home Finance", desc: "Home financing with competitive rates" },
  { id: "personal_loan", label: "Vehicle Finance", desc: "Flexible vehicle financing" },
];

export default function LoginPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [postLoginState, setPostLoginState] = useState<"idle" | "success">("idle");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const postLoginTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProductStage = stage === "product";

  const [selectedCountry, setSelectedCountry] = useState(GCC_COUNTRIES[0]);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [isAvatarSpeaking, setIsAvatarSpeaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasSpokenRef = useRef(false);

  // High fidelity Speech synthesis function with priority for female/lady voices
  const speakGreeting = (force?: boolean) => {
    try {
      if (typeof window === 'undefined') return;
      if (hasSpokenRef.current && !force) return;

      const synth = getSpeechSynthesisSafe();
      if (!synth) return;
      
      try {
        synth.cancel();
      } catch (err) {
        console.warn('synth.cancel blocked:', err);
      }

      const text = "assalamu alaikum, I am Raya , Your personal finance assistant.";
      if (!text.trim()) return;
      const UtteranceConstructor = getSpeechSynthesisUtteranceSafe();
      if (!UtteranceConstructor) return;

      const utterance = new UtteranceConstructor(text);
      
      let voices: SpeechSynthesisVoice[] = [];
      try {
        voices = synth.getVoices() || [];
      } catch (err) {
        console.warn('synth.getVoices() blocked:', err);
      }
      
      const matureKeywords = ['susan', 'hazel', 'samantha', 'zira', 'victoria', 'karen', 'moira', 'natural', 'female', 'premium', 'google us english'];
      let chosenVoice: SpeechSynthesisVoice | undefined = undefined;
      
      try {
        chosenVoice = voices.find(v => {
          if (!v || typeof v.name !== 'string' || typeof v.lang !== 'string') return false;
          const nameLower = v.name.toLowerCase();
          const lang = v.lang.toLowerCase();
          const isEnglish = lang.startsWith('en');
          return isEnglish && matureKeywords.some(keyword => nameLower.includes(keyword));
        });
      } catch (err) {
        console.warn('Voice lookup error in primary mature check:', err);
      }

      if (!chosenVoice) {
        try {
          chosenVoice = voices.find(v => {
            if (!v || typeof v.name !== 'string' || typeof v.lang !== 'string') return false;
            return v.lang.toLowerCase().startsWith('en') && v.name.includes('Google');
          });
        } catch (err) {}
      }

      if (!chosenVoice) {
        try {
          chosenVoice = voices.find(v => {
            if (!v || typeof v.lang !== 'string') return false;
            return v.lang.toLowerCase().startsWith('en');
          });
        } catch (err) {}
      }

      if (chosenVoice) {
        utterance.voice = chosenVoice;
      }
      
      utterance.rate = 0.94;
      utterance.pitch = 1.0;
      utterance.volume = 0;

      utterance.onstart = () => setIsAvatarSpeaking(true);
      utterance.onend = () => setIsAvatarSpeaking(false);
      utterance.onerror = () => setIsAvatarSpeaking(false);

      try {
        if (typeof synth.resume === 'function') {
          synth.resume();
        }
        synth.speak(utterance);
        hasSpokenRef.current = true;
      } catch (err) {
        setIsAvatarSpeaking(false);
      }
    } catch (e) {
      setIsAvatarSpeaking(false);
    }
  };

  useEffect(() => {
    const speakTimer = setTimeout(() => {
      speakGreeting();
    }, 600);

    try {
      const synth = getSpeechSynthesisSafe();
      if (synth) {
        synth.onvoiceschanged = () => {
          if (!hasSpokenRef.current) speakGreeting();
        };
      }
    } catch (e) {}

    const triggerSpeechOnInteraction = () => {
      if (!hasSpokenRef.current) speakGreeting();
    };

    window.addEventListener('click', triggerSpeechOnInteraction);
    window.addEventListener('touchstart', triggerSpeechOnInteraction);

    const focusTimer = setTimeout(() => {
      if (inputRef.current) {
        try {
          inputRef.current.focus();
        } catch (err) {}
      }
    }, 1500);

    return () => {
      clearTimeout(speakTimer);
      clearTimeout(focusTimer);
      window.removeEventListener('click', triggerSpeechOnInteraction);
      window.removeEventListener('touchstart', triggerSpeechOnInteraction);
    };
  }, []);

  useEffect(() => {
    if (stage === "otp") {
      otpRefs.current[0]?.focus();
    }
  }, [stage]);

  useEffect(() => {
    return () => {
      if (postLoginTimerRef.current) clearTimeout(postLoginTimerRef.current);
      if (landingTimerRef.current) clearTimeout(landingTimerRef.current);
    };
  }, []);

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, '');
    if (rawVal.length <= selectedCountry.length) {
      setPhone(rawVal);
      setError("");
    }
  };

  const getFormattedValue = () => {
    if (!phone) return '';
    const chars = phone.split('');
    if (chars.length > 1) chars.splice(1, 0, ' ');
    if (chars.length > 5) chars.splice(5, 0, ' ');
    return chars.join('');
  };

  const isValid = phone.length === selectedCountry.length;

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!isValid) {
      setError(`Please enter a valid ${selectedCountry.length}-digit mobile number.`);
      return;
    }
    setLoading(true);
    
    // Clean up speech synthesis if speaking when continuing
    const synth = getSpeechSynthesisSafe();
    if (synth) {
      try {
        synth.cancel();
      } catch (err) {}
    }

    try {
      const res = await fetch("/customer_agent/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone, purpose: "login" }),
      });
      const data = await res.json();
      if (!data.success) {
        setError("Failed to send OTP. Please try again.");
        setLoading(false);
        return;
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
      return;
    }
    setLoading(false);
    setStage("otp");
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value === "*") return;
    const cleanValue = value.replace(/\*/g, '');
    if (!/^\d*$/.test(cleanValue) && cleanValue !== "") return;
    
    const next = [...otp];
    next[index] = cleanValue.slice(-1);
    setOtp(next);
    
    if (cleanValue && index < 3) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPostLoginState("idle");
    const entered = otp.join("");
    if (entered.length < 4) {
      setError("Please enter the 4-digit OTP");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/customer_agent/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone, otp: entered, purpose: "login" }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? "Invalid OTP. Please try again.");
        setLoading(false);
        return;
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
      return;
    }

    if (postLoginTimerRef.current) clearTimeout(postLoginTimerRef.current);
    if (landingTimerRef.current) clearTimeout(landingTimerRef.current);
    
    postLoginTimerRef.current = setTimeout(() => {
      setLoading(false);
      setPostLoginState("success");
      landingTimerRef.current = setTimeout(() => {
        setStage("product");
      }, 900);
    }, 2000);
  };

  const selectProduct = (product: ProductId | string) => {
    router.push(`/${product}`);
  };

  if (isProductStage) {
    return (
      <div className="min-h-[100dvh] bg-[#FFFFFF] relative overflow-hidden pb-[calc(320px+env(safe-area-inset-bottom))] md:pb-24">
        <div className="w-full bg-white/80 backdrop-blur-xl border-b border-slate-200/80 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.45)] overflow-hidden">
          <div className="w-full px-6 py-3.5 flex items-center gap-3">
            <div className="h-10 w-10 bg-white/85 flex items-center justify-center shrink-0">
              <Image
                src="/customer_agent/assets/newgen_logo.png"
                alt="Newgen"
                width={28}
                height={28}
                className="h-7 w-auto object-contain"
                priority
              />
            </div>
            <h3 className="text-[18px] leading-5 font-semibold text-slate-900">Finance Agent</h3>
          </div>
          <div className="h-[2px] w-full bg-[#FB8B23]" />
        </div>

        <div className="min-h-[calc(100dvh-78px)] overflow-y-auto px-4 pt-4 pb-6 md:pt-6">
          <div className="w-full max-w-sm mx-auto space-y-7 px-2 py-3">
            <div className="text-center space-y-4">
              <h2 className="text-[24px] leading-none font-bold text-[#0D141A]">Welcome!</h2>
              <p className="text-[14px] leading-none font-normal text-[#0D141A] max-w-[95%] mx-auto text-center">
                I am your personal finance assistant. Let&apos;s start your digital finance application.
              </p>
              <p className="text-[14px] leading-none font-semibold text-[#0D141A] pt-2 text-center">Choose a category to begin</p>
            </div>

            <div className="space-y-3 pt-1">
              {productChoices.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectProduct(p.id)}
                  className="w-full rounded-full px-6 py-3.5 text-center text-white text-[14px] leading-5 font-semibold shadow-[0_8px_18px_-10px_rgba(15,76,120,0.6)] transition-all hover:brightness-105 active:scale-[0.99]"
                  style={{ background: "linear-gradient(to left, #0F4C78, #3CC2E1)" }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 z-20 w-full bg-white/98 backdrop-blur-md p-3 sm:p-4 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.12)]">
          <LandingChatBox onSelectProduct={selectProduct} />
        </div>
      </div>
    );
  }

  // The New Login UI
  return (
    <div className="min-h-screen bg-[#F7FAFD] text-slate-800 flex items-center justify-center font-sans p-3 sm:p-4 antialiased relative overflow-hidden">
      {/* Aesthetic ambient fluid blurred background glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-gradient-to-tr from-[#DDF1FC] to-[#4CB8E8]/20 rounded-full pointer-events-none blur-3xl -z-10 opacity-70" />
      <div className="absolute bottom-6 left-6 w-64 h-64 bg-[#4CB8E8]/5 pointer-events-none blur-3xl -z-10 opacity-40" />

      {/* Main Frosted Glass Smartphone Viewport Canvas */}
      <div className="relative w-full max-w-[380px] bg-white/75 backdrop-blur-xl border border-white/60 rounded-[28px] shadow-xl overflow-hidden flex flex-col items-center p-5 text-center gap-3.5 select-none">
        {/* Top visual flare glow effect */}
        <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-[#DDF1FC]/60 to-transparent -z-10" />

        {/* Pulsating RAYA Digital Avatar */}
        <div className="flex flex-col items-center w-full mt-1">
          <div className="relative mb-2">
            <AnimatePresence>
              {isAvatarSpeaking && (
                <>
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0.5 }}
                    animate={{ scale: 1.3, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 1.6, ease: "easeOut" }}
                    className="absolute inset-0 bg-[#4CB8E8]/30 rounded-full"
                  />
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0.4 }}
                    animate={{ scale: 1.45, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 1.6, delay: 0.5, ease: "easeOut" }}
                    className="absolute inset-0 bg-[#1F6FB2]/15 rounded-full"
                  />
                </>
              )}
            </AnimatePresence>
            
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 140, damping: 14 }}
              onClick={() => speakGreeting(true)}
              title="Click to hear Raya speak"
              className="relative w-12 h-12 rounded-full bg-gradient-to-tr from-[#1F6FB2] to-[#4CB8E8] flex items-center justify-center p-[2px] shadow-[0_0_15px_rgba(31,111,178,0.25)] border-2 border-white cursor-pointer hover:scale-105 active:scale-95 transition-all"
            >
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden relative">
                <div className="absolute inset-0 bg-[#F5F9FD] flex items-center justify-center">
                  <span className="text-xl">🤖</span>
                </div>
                
                {/* Micro-visualizer waves that flutter while speaking */}
                {isAvatarSpeaking && (
                  <div className="absolute bottom-1.5 left-0 right-0 flex justify-center items-end gap-[2px] h-2.5">
                    <span className="w-[2px] h-2 bg-[#1F6FB2] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <span className="w-[2px] h-2.5 bg-[#4CB8E8] rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                    <span className="w-[2px] h-1.5 bg-[#1F6FB2] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    <span className="w-[2px] h-2.5 bg-[#4CB8E8] rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                  </div>
                )}
              </div>

              {/* Little status particle marker */}
              <div className="absolute -bottom-0.5 -right-0.5 bg-[#2EAF62] w-3 h-3 rounded-full border border-white" />
            </motion.div>
          </div>

          <div className="text-[10px] font-bold text-[#1F6FB2] tracking-widest uppercase mb-0.5">
            Raya
          </div>
          <div className="text-[10.5px] font-semibold text-slate-500 tracking-tight flex items-center gap-1">
            <span>Your Personal Finance Assistant</span>
            <span className="w-1.5 h-1.5 bg-[#2EAF62] rounded-full animate-pulse" />
          </div>
        </div>

        <div className="text-center w-full px-1">
          <h2 className="text-base font-extrabold text-[#1F6FB2] tracking-tight leading-none mb-1">
            Smarter Cash Finance
          </h2>
          <p className="text-[11px] text-[#555] font-medium leading-relaxed max-w-[270px] mx-auto">
            Apply in minutes through a friendly real-time chat with Advisor Raya.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 w-full">
          <div className="bg-white/40 border border-white/20 p-2 rounded-xl flex flex-col items-center text-center transition-all">
            <div className="w-6 h-6 rounded-md bg-[#DDF1FC] text-[#1F6FB2] flex items-center justify-center mb-1">
              <Mic className="w-3.5 h-3.5 text-[#1F6FB2]" />
            </div>
            <h3 className="text-[9.5px] font-extrabold text-[#333] leading-none">Voice-First</h3>
            <p className="text-[8px] text-slate-400 mt-0.5 font-medium leading-none">Talk naturally</p>
          </div>

          <div className="bg-white/40 border border-white/20 p-2 rounded-xl flex flex-col items-center text-center transition-all">
            <div className="w-6 h-6 rounded-md bg-[#DDF1FC]/85 text-[#1F6FB2] flex items-center justify-center mb-1">
              <MessageSquare className="w-3.5 h-3.5 text-[#1F6FB2]" />
            </div>
            <h3 className="text-[9.5px] font-extrabold text-[#333] leading-none">Instant Guide</h3>
            <p className="text-[8px] text-slate-400 mt-0.5 font-medium leading-none">Fast support</p>
          </div>

          <div className="bg-white/40 border border-white/20 p-2 rounded-xl flex flex-col items-center text-center transition-all font-medium">
            <div className="w-6 h-6 rounded-md bg-[#DDF1FC]/85 text-[#1F6FB2] flex items-center justify-center mb-1">
              <Zap className="w-3.5 h-3.5 text-[#1F6FB2]" />
            </div>
            <h3 className="text-[9.5px] font-extrabold text-[#333] leading-none">Fast Approval</h3>
            <p className="text-[8px] text-slate-400 mt-0.5 leading-none">Simple check</p>
          </div>
        </div>

        {/* Form Container */}
        <div className="w-full bg-[#DDF1FC]/35 border border-[#4CB8E8]/25 rounded-xl p-4 text-left relative overflow-hidden">
          {stage === "phone" ? (
            <>
              <h3 className="text-[12px] font-bold text-[#1F6FB2] leading-none pb-0.5">Let&apos;s Get Started</h3>
              <p className="text-[10px] text-[#555] font-semibold mt-0.5">
                Enter your mobile number to begin safely.
              </p>

              <form onSubmit={handlePhoneSubmit} className="mt-3.5 flex flex-col gap-2.5">
                <div className="relative">
                  <div className="flex bg-white/95 border border-[#1F6FB2]/15 focus-within:border-[#1F6FB2] focus-within:ring-2 focus-within:ring-[#1F6FB2]/15 rounded-xl overflow-visible transition-all">
                    {/* Country Trigger dropdown */}
                    <button
                      type="button"
                      onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                      className="flex items-center gap-1 px-2.5 bg-slate-50 border-r border-[#1F6FB2]/10 hover:bg-slate-100 rounded-l-xl text-slate-700 font-semibold"
                    >
                      <span className="text-sm leading-none">{selectedCountry.flag}</span>
                      <span className="text-xs font-semibold">{selectedCountry.code}</span>
                      <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showCountryDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Number field */}
                    <input
                      ref={inputRef}
                      type="tel"
                      value={getFormattedValue()}
                      onChange={handleMobileChange}
                      placeholder={selectedCountry.placeholder}
                      className="w-full px-2.5 py-2.5 text-slate-800 font-bold placeholder-slate-300 focus:outline-hidden text-sm bg-transparent"
                      id="mobile-input-field"
                      aria-label="Mobile Number"
                    />
                  </div>

                  {/* Overlapping dropdown items */}
                  <AnimatePresence>
                    {showCountryDropdown && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowCountryDropdown(false)} />
                        <motion.div 
                          initial={{ opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 3 }}
                          className="absolute left-0 top-12 w-full max-w-[240px] bg-white border border-slate-150 rounded-xl shadow-lg z-25 overflow-hidden divide-y divide-slate-100"
                        >
                          {GCC_COUNTRIES.map((country) => (
                            <button
                              key={country.code}
                              type="button"
                              onClick={() => {
                                setSelectedCountry(country);
                                setPhone('');
                                setShowCountryDropdown(false);
                                if (inputRef.current) inputRef.current.focus();
                              }}
                              className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between hover:bg-[#DDF1FC]/30 transition-colors ${selectedCountry.code === country.code ? 'bg-[#DDF1FC]/40 text-[#1F6FB2]' : 'text-slate-700'}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-base">{country.flag}</span>
                                <span className="text-xs font-bold">{country.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono font-medium">{country.code}</span>
                            </button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                {error && (
                  <p className="text-[10px] font-bold text-rose-500 leading-none">
                    {error}
                  </p>
                )}

                {phone && (
                  <div className="flex items-center gap-1 px-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${isValid ? 'bg-[#2EAF62]' : 'bg-amber-400 animate-pulse'}`} />
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                      {isValid 
                        ? 'Valid Format' 
                        : `Requires ${selectedCountry.length - phone.length} digits`
                      }
                    </span>
                  </div>
                )}

                <button
                  id="cta-continue-button"
                  type="submit"
                  disabled={!isValid || loading}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold flex items-center justify-center gap-1.5 text-white shadow-md shadow-[#1F6FB2]/20 transition-all ${
                    isValid && !loading
                      ? 'bg-gradient-to-r from-[#1F6FB2] to-[#4CB8E8] cursor-pointer hover:shadow-lg active:scale-98' 
                      : 'bg-slate-300 cursor-not-allowed text-slate-400 shadow-none'
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2 text-xs">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sending...
                    </span>
                  ) : (
                    <>
                      <span className="text-xs">Continue</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              {postLoginState === "success" ? (
                <div className="text-center py-4">
                  <h3 className="text-[14px] font-bold text-[#2EAF62] leading-none mb-2">Login Successful</h3>
                  <p className="text-[11px] text-[#555] font-semibold">
                    Taking you to your landing page...
                  </p>
                </div>
              ) : (
                <>
                  <h3 className="text-[12px] font-bold text-[#1F6FB2] leading-none pb-0.5 text-center">Verify OTP</h3>
                  <p className="text-[10px] text-[#555] font-semibold mt-0.5 text-center">
                    A 4-digit code was sent to {selectedCountry.code} {phone}
                  </p>

                  <form onSubmit={handleOtpSubmit} className="mt-4 flex flex-col gap-3">
                    <div className="flex justify-center gap-3">
                      {otp.map((digit, i) => (
                        <input
                          key={i}
                          ref={(el) => {
                            otpRefs.current[i] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          aria-label={`OTP digit ${i + 1}`}
                          maxLength={1}
                          className="w-12 h-12 text-center text-[16px] font-bold bg-white/95 border border-[#1F6FB2]/15 focus:ring-2 focus:ring-[#1F6FB2]/15 focus:border-[#1F6FB2] rounded-xl text-slate-800 transition-all outline-none"
                          value={digit ? "*" : ""}
                          onChange={(e) => handleOtpChange(i, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        />
                      ))}
                    </div>

                    {error && (
                      <p className="text-[10px] font-bold text-rose-500 leading-none text-center">
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={loading || otp.join("").length < 4}
                      className={`w-full py-2.5 px-4 rounded-xl font-bold flex items-center justify-center gap-1.5 text-white shadow-md shadow-[#1F6FB2]/20 transition-all ${
                        otp.join("").length === 4 && !loading
                          ? 'bg-gradient-to-r from-[#1F6FB2] to-[#4CB8E8] cursor-pointer hover:shadow-lg active:scale-98' 
                          : 'bg-slate-300 cursor-not-allowed text-slate-400 shadow-none'
                      }`}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2 text-xs">
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Verifying...
                        </span>
                      ) : (
                        <span className="text-xs">Verify & Continue</span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setStage("phone");
                        setOtp(["", "", "", ""]);
                        setError("");
                      }}
                      className="text-[10px] font-bold text-[#1F6FB2] hover:underline text-center mt-1"
                    >
                      Change Mobile Number
                    </button>
                  </form>
                </>
              )}
            </>
          )}

          {/* <div className="text-center mt-3 border-t border-[#4CB8E8]/10 pt-2.5">
            <button 
              type="button"
              className="text-[10px] font-bold text-[#1F6FB2] hover:underline"
            >
              Explore and Calculate Rates
            </button>
          </div> */}
        </div>

        <div className="w-full bg-white/40 border border-white/20 rounded-xl p-2 flex items-center gap-2 text-left">
          <Mic className="w-3.5 h-3.5 text-[#1F6FB2] shrink-0" />
          <p className="text-[10px] text-[#1F6FB2] font-semibold leading-tight">
            Use voice, text, or both throughout the entire check.
          </p>
        </div>

        <div className="w-full pt-2.5 border-t border-gray-200/45 flex flex-col items-center gap-1">
          <div className="flex justify-center gap-3 text-[9px] font-bold text-slate-500/80">
            <span>● Secured</span>
            <span>● Protected Data</span>
            <span>● Shariah Compliant</span>
          </div>
          <p className="text-[8.5px] text-gray-400 font-semibold leading-tight">
            By proceeding, you agree to Terms & Conditions • SAMA Licensed Fintech
          </p>
        </div>
      </div>
    </div>
  );
}
