# shared/constants/languages.py

from enum import Enum

class Language(str, Enum):
    ARABIC = "arabic"
    ENGLISH = "english"
    HINDI = "hindi"
    MIXED = "mixed"

def is_rtl(lang: Language) -> bool:
    return lang == Language.ARABIC
