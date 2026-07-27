"use client";

import { useState, useEffect } from 'react';
import { getDirection } from '@/lib/rtl';

export function useLanguage(initialLang: string = 'english') {
  const [language, setLanguage] = useState<string>(initialLang);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>(getDirection(initialLang));

  useEffect(() => {
    setDirection(getDirection(language));
    document.documentElement.dir = getDirection(language);
    document.documentElement.lang = language === 'arabic' ? 'ar' : 'en';
  }, [language]);

  return { language, setLanguage, direction };
}
