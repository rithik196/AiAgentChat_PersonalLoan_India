/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import LandingPage from './components/LandingPage';
import ChatJourney from './components/ChatJourney';
import { UserSession, AppStage } from './types';

export default function App() {
  const [appStage, setAppStage] = useState<AppStage>('landing');
  const [userSession, setUserSession] = useState<UserSession>({
    mobileNumber: '',
    countryCode: '+966',
    fullName: 'Valued Client',
    financeType: 'islamic', // default to Islamic Shariah-compliant Murabaha
    amount: 150000,         // default SAR 150,000 application amount
    tenure: 36,             // default 3-year term
    stageIndex: 0
  });

  // Handle successful mobile verification & transition into chatbot interface
  const handleOnContinueMobile = (mobile: string, countryCode: string) => {
    setUserSession(prev => ({
      ...prev,
      mobileNumber: mobile,
      countryCode: countryCode,
      fullName: `Client-${mobile.slice(-4)}`
    }));
    
    // Smooth stage transition
    setAppStage('chat_journey');
  };

  const handleOnBackToLanding = () => {
    setAppStage('landing');
  };

  return (
    <div className="bg-[#F7FAFD] w-full min-h-screen relative overflow-x-hidden selection:bg-[#4CB8E8]/30">
      <AnimatePresence mode="wait">
        {appStage === 'landing' ? (
          <motion.div
            key="landing-page"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="w-full h-full"
          >
            <LandingPage onContinue={handleOnContinueMobile} />
          </motion.div>
        ) : (
          <motion.div
            key="chat-journey-page"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="w-full h-full"
          >
            <ChatJourney 
              session={userSession}
              onBack={handleOnBackToLanding}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
