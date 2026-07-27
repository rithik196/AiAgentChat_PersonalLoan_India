import re
from typing import Any


QUESTION_STARTERS = (
    "what",
    "why",
    "how",
    "when",
    "where",
    "which",
    "who",
    "can you",
    "could you",
    "do i",
    "does",
    "is",
    "are",
    "will",
    "would",
    "should",
    "tell me",
    "explain",
    "describe",
    "meaning",
    "define",
)

QUESTION_PHRASES = (
    "what is",
    "what are",
    "what does",
    "why do",
    "why is",
    "how do",
    "how can",
    "can you explain",
    "could you explain",
    "tell me about",
    "explain about",
    "meaning of",
    "difference between",
    "i want to know",
    "i need to know",
)

SMALL_TALK_PHRASES = (
    "hi",
    "hello",
    "hey",
    "how are you",
    "how are you doing",
    "what's up",
    "whats up",
    "good morning",
    "good afternoon",
    "good evening",
    "nice to meet you",
    "are you there",
    "Thank you",
)

CONTINUATION_PHRASES = {
    "yes",
    "yep",
    "yeah",
    "ya",
    "sure",
    "ok",
    "ohk",
    "okay",
    "alright",
    "proceed",
    "continue",
    "go ahead",
    "start",
    "begin",
    "done",
    "confirmed",
}

DECLINE_PHRASES = {
    "no",
    "nope",
    "not now",
    "cancel",
    "decline",
}

INTERNAL_PREFIXES = (
    "__sys__",
    "update_personal",
    "update_address",
    "update_employment",
    "update_income",
    "update_expenses",
    "document_uploaded:",
    "profile_completion:",
)

RESUME_PROMPTS: dict[tuple[str, str], str] = {
    ("identity", "awaiting_id"): "Please share your 10-digit National ID or Iqama number.",
    ("identity", "nafath_pending"): "Please approve the request in Nafath, then tell me once it is done.",
    ("identity", "loading"): "Please wait while I complete the verification.",
    ("identity", "verified"): "Please continue so I can check your application details.",
    ("identity", "dedupe_check"): "Please continue while I check whether you already have an application.",
    ("identity", "identify_yourself"): "Please proceed so I can collect your personal details.",
    ("identity", "personal_details"): "Please review your profile details and confirm or choose Modify Details.",
    ("identity", "modify_section"): "Please choose which section you want to modify: personal, address, employment, or income.",
    ("identity", "modify_personal"): "Please provide the updated personal detail requested on the screen.",
    ("identity", "modify_address"): "Please provide the updated address detail requested on the screen.",
    ("identity", "modify_address_choice"): "Please choose whether to update the existing address or add a new address.",
    ("identity", "modify_employment"): "Please provide the updated employment detail requested on the screen.",
    ("identity", "modify_employment_document_pending"): "Please upload the required employment document to continue.",
    ("identity", "modify_income"): "Please enter your updated monthly income amount.",
    ("identity", "modify_income_proof_choice"): "Please choose Open Banking or upload a bank statement for income proof.",
    ("identity", "modify_income_upload_statement"): "Please upload your bank statement to continue.",
    ("identity", "open_banking_email_sent"): "Please complete Open Banking from the email link, then tell me once it is linked.",
    ("identity", "expenses"): "Please review your expenses and confirm or modify them.",
    ("identity", "bureau_consent"): "Please provide your bureau consent so I can continue the eligibility check.",
    ("identity", "eligibility_check"): "Please wait while I complete the eligibility check.",
    ("offer", "bureau_consent"): "Please provide your bureau consent so I can check your offer.",
    ("offer", "pre_approved_offer"): "Please review your pre-approved offer and continue.",
    ("offer", "eligible"): "Please review the eligible offer and continue.",
    ("offer", "wants_more_decision"): "Please tell me whether this amount is okay or you want more.",
    ("offer", "wants_more_review"): "Please review the higher amount requirement and choose how you want to continue.",
    ("offer", "wants_more_open_banking"): "Please complete Open Banking for the higher amount review, or go back.",
    ("offer", "wants_more_backoffice"): "Please wait while your higher amount request is reviewed.",
    ("offer", "slider"): "Please select your preferred finance amount and tenure.",
    ("offer", "summary"): "Please review the finance summary and continue.",
    ("trade", "authorize"): "Please authorize the commodity trade to continue.",
    ("trade", "loading"): "Please wait while I complete the commodity trade.",
    ("trade", "success"): "Please continue to view the commodity certificate.",
    ("trade", "certificate"): "Please review the commodity certificate and proceed to e-sign.",
    ("esign", "documents"): "Please review the documents and proceed with e-signing.",
    ("esign", "email_sent"): "Please complete the e-signing from the email link, then tell me once it is done.",
    ("esign", "otp_ivr"): "Please choose OTP verification or IVR verification.",
    ("disburse", "account"): "Please select the account where you want the finance amount disbursed.",
    ("disburse", "iban_validation"): "Please confirm the IBAN validation result to continue.",
    ("disburse", "application_summary"): "Please review the application summary and continue.",
    ("disburse", "ivr_consent"): "Please choose OTP verification or IVR verification for final verification.",
    ("disburse", "otp_entry"): "Please enter the 4-digit OTP sent to your registered mobile number.",
    ("disburse", "otp_verifying"): "Please wait while I verify the OTP.",
    ("disburse", "ivr_requested"): "Please complete the IVR verification, then tell me once it is done.",
    ("disburse", "otp_success"): "Please continue to complete disbursement.",
    ("disburse", "ivr_success"): "Please continue to complete disbursement.",
}

DEFAULT_RESUME_PROMPT = (
    "Let's continue from where we were. Please provide the requested information so I can continue your application."
)

OUT_OF_SCOPE_ANSWER = (
    "I can help with questions related to this Cash Finance journey, but I cannot assist with that topic here."
)


def normalize_chat_text(text: str) -> str:
    normalized = (text or "").strip().lower()
    normalized = normalized.replace("\u2019", "'")
    normalized = re.sub(r"[^\w\s:'-]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def _contains_phrase(text: str, phrase: str) -> bool:
    return bool(re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", text))


def _is_valid_step_data(text: str, normalized: str, session: dict[str, Any]) -> bool:
    if not normalized:
        return False
    if normalized.startswith(INTERNAL_PREFIXES):
        return True
    if normalized in CONTINUATION_PHRASES or normalized in DECLINE_PHRASES:
        return True
    if re.fullmatch(r"[12]\d{9}", normalized):
        return True
    if re.fullmatch(r"\d{6}", normalized):
        return True
    if re.fullmatch(r"\d{4,6}", normalized.replace(",", "")):
        return session.get("sub_step") in {"modify_income", "modify_income_proof_choice"}
    if re.search(r"\b([12]\d{9})\b", text or ""):
        return session.get("step") == "identity" and session.get("sub_step") == "awaiting_id"
    return False


def looks_like_fallback_interruption(raw_text: str, session: dict[str, Any] | None = None) -> bool:
    session = session or {}
    text = (raw_text or "").strip()
    normalized = normalize_chat_text(text)
    if not normalized or _is_valid_step_data(text, normalized, session):
        return False
    if any(_contains_phrase(normalized, phrase) for phrase in SMALL_TALK_PHRASES):
        return True
    if "?" in text:
        return True
    if any(normalized.startswith(starter) for starter in QUESTION_STARTERS):
        return True
    return any(_contains_phrase(normalized, phrase) for phrase in QUESTION_PHRASES)


def build_resume_prompt(session: dict[str, Any] | None = None) -> str:
    session = session or {}
    step = str(session.get("step") or "identity")
    sub_step = str(session.get("sub_step") or "awaiting_id")
    prompt = RESUME_PROMPTS.get((step, sub_step))
    if prompt:
        return prompt

    profile_completion = session.get("profile_completion") or {}
    current_field = profile_completion.get("current_field")
    if step == "identity" and sub_step == "personal_details" and current_field:
        return f"Please provide your {current_field} so I can complete your profile details."

    return DEFAULT_RESUME_PROMPT


def compose_fallback_response(answer: str | None, session: dict[str, Any] | None = None) -> str:
    cleaned_answer = (answer or "").strip() or OUT_OF_SCOPE_ANSWER
    resume_prompt = build_resume_prompt(session)
    if resume_prompt.lower() in cleaned_answer.lower():
        return cleaned_answer
    return f"{cleaned_answer}\n\n{resume_prompt}"
