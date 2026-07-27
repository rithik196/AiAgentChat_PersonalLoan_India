/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Mic, 
  MicOff, 
  Bot, 
  User, 
  ChevronLeft, 
  Lock, 
  Sparkles, 
  Scale, 
  Paperclip,
  X,
  Volume2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Message, UserSession } from '../types';
import FinanceCalculator from './FinanceCalculator';

interface ChatJourneyProps {
  session: UserSession;
  onBack: () => void;
}

export default function ChatJourney({ session: initialSession, onBack }: ChatJourneyProps) {
  const [session, setSession] = useState<UserSession>(initialSession);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState('');
  const [completedDocuments, setCompletedDocuments] = useState<string[]>([]);
  
  const threadEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Initial messages sequence
  useEffect(() => {
    setMessages([
      {
        id: 'init-1',
        sender: 'system',
        text: `Secure connection established with ${session.countryCode} ${session.mobileNumber}. Session is encrypted and SAMA compliant.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
      {
        id: 'init-2',
        sender: 'raya',
        text: `Marhaban! I'm Raya, your digital banking advisor. Thank you for registering your mobile. 

We can explore competitive retail finance options together, choosing between a **Shariah-Compliant Tawarruq** structure or a **Conventional Cash Finance** product.

To help me tailor the absolute best profit rates for you, which option do you prefer?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        options: [
          { label: 'Murabaha / Tawarruq (Islamic)', value: 'islamic', actionId: 'select-islamic' },
          { label: 'Conventional Personal Loan', value: 'conventional', actionId: 'select-conventional' },
          { label: 'Check Standard Eligibility', value: 'eligibility', actionId: 'check-eligibility' }
        ],
        contentType: 'intro'
      }
    ]);
  }, []);

  // Sync scroll on message updates
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Handle Speech Recognition Setup
  useEffect(() => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'en-US'; // Default to English, though we could support multi-lingual

        rec.onstart = () => {
          try {
            setIsRecording(true);
            setRecordingStatus('RAYA is listening...');
          } catch (err) {
            console.warn('onstart handler error:', err);
          }
        };

        rec.onresult = (event: any) => {
          try {
            const transcript = event.results[0][0].transcript;
            if (transcript) {
              setInputText(transcript);
            }
          } catch (err) {
            console.error('onresult handler error:', err);
          }
        };

        rec.onerror = (e: any) => {
          try {
            console.error('Speech recognition error:', e);
            setRecordingStatus('Error capturing audio.');
            setIsRecording(false);
          } catch (err) {
            console.warn('onerror handler error:', err);
          }
        };

        rec.onend = () => {
          try {
            setIsRecording(false);
            setRecordingStatus('');
          } catch (err) {
            console.warn('onend handler error:', err);
          }
        };

        recognitionRef.current = rec;
      }
    } catch (e) {
      console.warn('Speech recognition is not supported or was blocked in this context:', e);
    }
  }, []);

  // Trigger mic recording
  const handleToggleRecord = () => {
    if (!recognitionRef.current) {
      // Elegant simulated Speech capture if WebSpeech isn't supported in iframe
      setIsRecording(true);
      setRecordingStatus('Recording audio (simulated)...');
      
      const mockCaptures = [
        "What is the profit rate on Shariah finance?",
        "Check my eligibility for SAR 200,000 please",
        "Explain Tawarruq commodity trade process",
        "What documents are needed to apply?"
      ];

      setTimeout(() => {
        const randomSelect = mockCaptures[Math.floor(Math.random() * mockCaptures.length)];
        setInputText(randomSelect);
        setIsRecording(false);
        setRecordingStatus('');
      }, 2500);
      return;
    }

    if (isRecording) {
      try {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
      } catch (err) {
        console.warn('Recognition stop trigger error:', err);
      }
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.warn('Recognition start trigger error:', err);
      }
    }
  };

  // Submit chat string to server
  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMsgId = `user-${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      // Communicate server-side using our POST endpoint
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          userProfile: {
            mobileNumber: session.mobileNumber,
            countryCode: session.countryCode,
            fullName: session.fullName,
            financeType: session.financeType,
            amount: session.amount,
            tenure: session.tenure
          }
        })
      });

      const data = await response.json();
      setIsTyping(false);

      if (response.ok && data.text) {
        const rayaMsgId = `raya-${Date.now()}`;
        
        // Add dynamic quick reply options depending on what Raya replies
        let defaultOptions = [
          { label: 'Check Eligibility Requirements', value: 'Check eligibility requirement logs' },
          { label: 'Needed Documents Checklist', value: 'What documents are required for application' },
          { label: 'Ask about Profit Rates', value: 'Tell me about profit rates and Shariah structure' }
        ];

        // Custom options for checklist or next action
        if (data.text.toLowerCase().includes('document') || data.text.toLowerCase().includes('checklist')) {
          defaultOptions = [
            { label: 'Verify my Saudi ID / Iqama', value: 'Verify ID through Nafath portal' },
            { label: 'Show active calculators', value: 'Open loan parameters calculator screen' },
            { label: 'Confirm finance pre-approval', value: 'Submit for pre-approval check' }
          ];
        }

        setMessages(prev => [...prev, {
          id: rayaMsgId,
          sender: 'raya',
          text: data.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          options: defaultOptions
        }]);
      } else {
        throw new Error(data.error || 'Server rejected request');
      }

    } catch (err: any) {
      console.error('Chat routing error:', err);
      setIsTyping(false);
      
      // Graceful error fallback
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        sender: 'raya',
        text: 'I apologize, I experienced a minor connectivity hiccup with our banking server. How may I assist you further? Feel free to adjust the live finance calculators!',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        options: [
          { label: 'Murabaha / Tawarruq (Islamic)', value: 'Murabaha Islamic Tawarruq structure' },
          { label: 'Check Standard Eligibility', value: 'What are the eligibility criteria' }
        ]
      }]);
    }
  };

  const handleQuickReply = (value: string) => {
    handleSendMessage(value);
  };

  // Sync parameters inside calculator to state & emit prompt
  const handleCalculatorSync = () => {
    const pType = session.financeType === 'islamic' ? 'Islamic (Tawarruq)' : 'Conventional';
    const msg = `I would like to apply for a ${pType} finance product of SAR ${session.amount.toLocaleString()} over a period of ${session.tenure} months.`;
    handleSendMessage(msg);
  };

  // Checkbox checklist toggle for document uploading
  const handleToggleDoc = (docId: string) => {
    if (completedDocuments.includes(docId)) {
      setCompletedDocuments(prev => prev.filter(id => id !== docId));
    } else {
      setCompletedDocuments(prev => [...prev, docId]);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7FAFD] text-slate-800 flex items-center justify-center font-sans p-2 sm:p-6 antialiased relative overflow-hidden h-screen">
      {/* Decorative Aura Background Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-gradient-to-tr from-[#DDF1FC] to-[#4CB8E8]/25 rounded-full pointer-events-none blur-3xl -z-10 opacity-60" />
      <div className="absolute bottom-10 left-10 w-72 h-72 bg-[#4CB8E8]/10 pointer-events-none blur-3xl -z-10 opacity-30" />

      {/* Embedded smartphone canvas under Frosted Glass Theme */}
      <div className="relative w-full max-w-[450px] h-[95vh] max-h-[850px] bg-white/70 backdrop-blur-xl border border-white/50 rounded-[32px] shadow-2xl overflow-hidden flex flex-col justify-between">
        
        {/* Premium Connection Session Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-white/40 px-4 py-3 shrink-0 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <button 
              onClick={onBack}
              className="p-1 px-1.5 hover:bg-slate-50 border border-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
              title="Go Back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-2">
              <div className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-[#1F6FB2] to-[#4CB8E8] flex items-center justify-center text-white font-bold p-[1px]">
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center overflow-hidden">
                  <span className="text-xs">🤖</span>
                </div>
                <div className="absolute bottom-0 right-0 w-2 h-2 bg-[#2EAF62] rounded-full border border-white" />
              </div>
              
              <div>
                <div className="flex items-center gap-1">
                  <h2 className="text-xs font-bold text-slate-800 leading-none">Raya Digital Assistant</h2>
                  <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                </div>
                <p className="text-[9px] text-slate-400 font-medium leading-none mt-1">
                  Session Secured • Saudi SAMA Compliant
                </p>
              </div>
            </div>
          </div>

          {/* Bank Session Status Badge */}
          <div className="bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold">
            <Lock className="w-2.5 h-2.5 text-emerald-600" />
            <span>ENCRYPTED</span>
          </div>
        </header>

        {/* Primary Conversation Area & Layout Splitters */}
        <main className="flex-grow flex flex-col overflow-hidden relative">
          
          {/* Left Side: Standard Mobile Chat Message Board */}
          <div className="flex-grow flex flex-col justify-between h-full overflow-hidden">
            
            {/* Scrollable chat messages container */}
            <div className="flex-grow overflow-y-auto p-4 space-y-4">
              
              {/* Embedded Calculator inside thread as a welcome card */}
              <div className="mb-4">
                <FinanceCalculator 
                  amount={session.amount}
                  tenure={session.tenure}
                  financeType={session.financeType}
                  onChangeAmount={(val) => setSession(prev => ({ ...prev, amount: val }))}
                  onChangeTenure={(val) => setSession(prev => ({ ...prev, tenure: val }))}
                  onChangeType={(type) => setSession(prev => ({ ...prev, financeType: type }))}
                  onSync={handleCalculatorSync}
                />
              </div>

              <AnimatePresence initial={false}>
                {messages.map((msg) => {
                  const isRaya = msg.sender === 'raya';
                  const isSystem = msg.sender === 'system';

                  if (isSystem) {
                    return (
                      <motion.div 
                        key={msg.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-center"
                      >
                        <div className="bg-blue-50/50 border border-blue-100/30 text-[10px] text-blue-600/90 font-semibold px-3 py-1 bg-white rounded-lg flex items-center gap-1.5 shadow-xs">
                          <Lock className="w-3 h-3 inline" />
                          <span>{msg.text}</span>
                        </div>
                      </motion.div>
                    );
                  }

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 180, damping: 20 }}
                      className={`flex ${isRaya ? 'justify-start' : 'justify-end'} items-start gap-2`}
                    >
                      {/* Raya circular logo beside her replies */}
                      {isRaya && (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#1F6FB2] to-[#4CB8E8] flex items-center justify-center text-white shrink-0 shadow-sm border border-white">
                          <Bot className="w-4 h-4" />
                        </div>
                      )}

                      <div className="max-w-[82%] flex flex-col">
                        {/* Speech Bubble */}
                        <div 
                          className={`p-3 rounded-2xl text-xs leading-relaxed ${
                            isRaya 
                              ? 'bg-white rounded-tl-sm text-slate-800 shadow-xs border border-slate-100' 
                              : 'bg-gradient-to-tr from-[#1F6FB2] to-[#4CB8E8] rounded-tr-sm text-white shadow-md'
                          }`}
                        >
                          {/* Format paragraph content rendering securely */}
                          <div className="whitespace-pre-line font-medium">
                            {msg.text}
                          </div>

                          {/* If Raya introduces standard documents checklist, show interactive check items */}
                          {isRaya && (msg.text.toLowerCase().includes('document') || msg.text.toLowerCase().includes('checklist')) && (
                            <div className="mt-3 border-t border-slate-100 pt-2.5 space-y-2">
                              <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider inline-block">Application Steps checklist:</span>
                              <div className="space-y-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleToggleDoc('natid')}
                                  className="w-full flex items-center gap-2 px-2 py-1 hover:bg-slate-50 border border-slate-100 rounded-lg text-[10px] font-semibold text-slate-700 transition-all text-left"
                                >
                                  <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors ${completedDocuments.includes('natid') ? 'bg-[#2EAF62] text-white border-[#2EAF62]' : 'border-slate-300'}`}>
                                    {completedDocuments.includes('natid') && <span className="text-[7px]">✓</span>}
                                  </span>
                                  <span>National ID / Iqama Check</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleToggleDoc('salary')}
                                  className="w-full flex items-center gap-2 px-2 py-1 hover:bg-slate-50 border border-slate-100 rounded-lg text-[10px] font-semibold text-slate-700 transition-all text-left"
                                >
                                  <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors ${completedDocuments.includes('salary') ? 'bg-[#2EAF62] text-white border-[#2EAF62]' : 'border-slate-300'}`}>
                                    {completedDocuments.includes('salary') && <span className="text-[7px]">✓</span>}
                                  </span>
                                  <span>Upload Salary Certificate</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleToggleDoc('bank')}
                                  className="w-full flex items-center gap-2 px-2 py-1 hover:bg-slate-50 border border-slate-100 rounded-lg text-[10px] font-semibold text-slate-700 transition-all text-left"
                                >
                                  <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors ${completedDocuments.includes('bank') ? 'bg-[#2EAF62] text-white border-[#2EAF62]' : 'border-slate-300'}`}>
                                    {completedDocuments.includes('bank') && <span className="text-[7px]">✓</span>}
                                  </span>
                                  <span>Submit 3-Month Bank Statements</span>
                                </button>
                              </div>

                              {completedDocuments.length === 3 && (
                                <motion.div 
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-semibold p-2 rounded-lg flex items-center gap-1.5 mt-2"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-[#2EAF62] shrink-0" />
                                  <span>All documents logged! Ask Raya: "Submit my pre-approval analysis".</span>
                                </motion.div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Msg Timestamp */}
                        <span className={`text-[9px] text-slate-400 mt-0.5 font-semibold ${!isRaya ? 'text-right' : 'text-left'}`}>
                          {msg.timestamp}
                        </span>

                        {/* Custom Quick Reply suggestion chips for Raya messages */}
                        {isRaya && msg.options && messages.indexOf(msg) === messages.length - 1 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {msg.options.map((opt, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => handleQuickReply(opt.value)}
                                className="text-[10px] bg-white text-[#1F6FB2] border border-[#DDF1FC] hover:border-[#1F6FB2]/40 hover:bg-[#DDF1FC]/30 rounded-full px-2.5 py-1 font-semibold transition-all shadow-xs shrink-0 cursor-pointer active:scale-97"
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Raya animated typing indicators */}
              <AnimatePresence>
                {isTyping && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start items-center gap-2"
                  >
                    <div className="w-7 h-7 rounded-full bg-[#1F6FB2] flex items-center justify-center text-white shrink-0 shadow-xs">
                      <Bot className="w-3.5 h-3.5 animate-spin" />
                    </div>
                    <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-tl-sm flex items-center gap-1 shadow-xs">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.5s' }} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <div ref={threadEndRef} />
            </div>

            {/* Active audio capturing waves overlay */}
            <AnimatePresence>
              {isRecording && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-sky-50 border-t border-[#DDF1FC] px-4 py-2.5 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="relative w-7 h-7 rounded-full bg-rose-500 text-white flex items-center justify-center">
                      <motion.div 
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1.5, opacity: 0 }}
                        transition={{ repeat: Infinity, duration: 1.2, ease: 'easeOut' }}
                        className="absolute inset-0 bg-rose-500 rounded-full"
                      />
                      <Mic className="w-3.5 h-3.5 relative" />
                    </div>

                    <div>
                      <span className="text-[11px] font-bold text-slate-800 tracking-tight block">
                        {recordingStatus}
                      </span>
                      <span className="text-[9px] text-slate-400 font-medium">
                        Speak normally to talk to Advisor.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-end gap-[2px] h-5 cursor-pointer">
                    <span className="w-[2px] h-2 bg-[#1F6FB2] rounded-full animate-pulse" />
                    <span className="w-[2px] h-4 bg-[#4CB8E8] rounded-full animate-pulse" style={{ animationDelay: '100ms' }} />
                    <span className="w-[2px] h-5 bg-[#1F6FB2] rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                    <span className="w-[2px] h-3 bg-[#4CB8E8] rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Chat text & mic submission board footer */}
            <div className="bg-white/85 backdrop-blur-md border-t border-white/40 p-3 flex flex-col gap-1.5 shrink-0">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (inputText.trim()) {
                    handleSendMessage(inputText);
                  }
                }}
                className="flex items-center gap-2"
              >
                {/* Voice capture trigger */}
                <button
                  type="button"
                  onClick={handleToggleRecord}
                  className={`p-2.5 rounded-xl flex items-center justify-center transition-all ${
                    isRecording 
                      ? 'bg-rose-500 text-white shadow-lg' 
                      : 'bg-slate-100 hover:bg-slate-200 text-[#1F6FB2]'
                  }`}
                  title="Speak to Raya voice first"
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 animate-pulse" />}
                </button>

                {/* Text Area */}
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ask and apply..."
                  className="w-full bg-white/70 border border-slate-200 focus:border-[#1F6FB2] focus:ring-2 focus:ring-[#1F6FB2]/12 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden font-semibold transition-all"
                  disabled={isTyping}
                />

                {/* Submit trigger button */}
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className={`p-2.5 rounded-xl text-white flex items-center justify-center transition-all ${
                    inputText.trim() 
                      ? 'bg-gradient-to-r from-[#1F6FB2] to-[#4CB8E8] hover:shadow-md cursor-pointer active:scale-97' 
                      : 'bg-indigo-50 text-slate-300 cursor-not-allowed'
                  }`}
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

              <span className="text-[8px] text-slate-400 font-semibold text-center leading-none">
                SAMA Compliant • SECURE CONNECTION
              </span>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
