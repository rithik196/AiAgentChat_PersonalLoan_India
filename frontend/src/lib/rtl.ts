export function getDirection(language: string): 'rtl' | 'ltr' {
  if (language.toLowerCase() === 'arabic') {
    return 'rtl';
  }
  return 'ltr';
}

export function isRTL(language: string): boolean {
  return getDirection(language) === 'rtl';
}
