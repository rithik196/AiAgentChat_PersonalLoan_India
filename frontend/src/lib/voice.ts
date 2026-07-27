/**
 * Select a female voice from the browser's available speech synthesis voices.
 * Prefers Microsoft/Google female voices that sound natural.
 */
export function getFemaleVoice(lang: string): SpeechSynthesisVoice | null {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  const voices = synth?.getVoices() ?? [];
  if (voices.length === 0) return null;

  const langPrefix = lang.slice(0, 2).toLowerCase();
  const voicesForLanguage = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith(langPrefix)
  );
  if (voicesForLanguage.length === 0) return null;

  // Prefer local voices first; remote voices can fail silently on managed networks.
  const preferredPool = [...voicesForLanguage].sort((a, b) =>
    Number(Boolean(b.localService)) - Number(Boolean(a.localService))
  );

  // Preferred female voice names (ranked by quality)
  const preferred = [
    "Microsoft Zira",       // Windows English female
    "Microsoft Aria",       // Windows English female (neural)
    "Google UK English Female",
    "Google US English",
    "Samantha",             // macOS
    "Karen",                // macOS Australian
    "Victoria",             // macOS
    "Fiona",                // macOS
  ];

  // Try preferred voices first.
  for (const name of preferred) {
    const v = preferredPool.find((voice) => voice.name.includes(name));
    if (v) return v;
  }

  // Fallback: any voice whose name suggests female for the target language.
  const femaleKeywords = /female|woman|zira|aria|samantha|karen|fiona|victoria|heera|aditi/i;
  const langMatch = preferredPool.find((voice) => femaleKeywords.test(voice.name));
  if (langMatch) return langMatch;

  // Final fallback: first language-compatible voice.
  return preferredPool[0] ?? null;
}
