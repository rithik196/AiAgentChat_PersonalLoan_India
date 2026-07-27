"""
Chat API gateway — proxies to LangGraph agent (port 8001),
handles session management, widget resolution, and SSE streaming.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any
from contextvars import ContextVar
import httpx
import html
import json
import subprocess
import tempfile
import time
import math
import random
import re
import logging
import os
import string
import sys
import textwrap
from pathlib import Path
import datetime

from db import get_customer_by_phone, get_customer_by_national_id, update_customer, get_etb_registered_ibans
from services.mail import send_open_banking_email, send_docusign_email
from services.otp import send_otp, verify_otp
from utils.eligibility import calculate_max_eligible_amount

router = APIRouter()
logger = logging.getLogger(__name__)

_STREAM_SESSION_ID: ContextVar[str | None] = ContextVar("stream_session_id", default=None)
_STREAM_USER_TEXT: ContextVar[str | None] = ContextVar("stream_user_text", default=None)

AGENT_URL = os.getenv("AGENT_URL", "http://localhost:8001")
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))
AGENT_DIR = REPO_ROOT / "agent"
if str(AGENT_DIR) not in sys.path:
    sys.path.append(str(AGENT_DIR))
try:
    from knowledge.faq_engine import answer_general_query as answer_gateway_general_query
except Exception:
    answer_gateway_general_query = None

try:
    from shared.journey_fallback import compose_fallback_response, looks_like_fallback_interruption
except Exception:
    compose_fallback_response = None
    looks_like_fallback_interruption = None

try:
    from shared.persistence import mongo_journey
except Exception:
    mongo_journey = None

COMMODITY_CERTIFICATE_TEMPLATE = REPO_ROOT / "frontend" / "public" / "assets" / "CommodityCertificate.html"
COMMODITY_CERTIFICATE_OUTPUT_DIR = Path(os.getenv("COMMODITY_CERTIFICATE_OUTPUT_DIR", REPO_ROOT / ".data" / "generated_documents"))
CHROME_CANDIDATES = (
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
)

# ── In-memory session store (backed by agent persistence) ────────────
SESSION_STORE: dict[str, dict] = {}
GATEWAY_SESSION_DIR = REPO_ROOT / ".data" / "sessions"
GATEWAY_SESSION_DIR.mkdir(parents=True, exist_ok=True)

COMMODITY_CERTIFICATE_PRICE = 3710.80


@router.get("/chat/generated-documents/{filename}")
async def get_generated_document(filename: str, download: bool = False):
    safe_name = Path(filename).name
    if safe_name != filename or not safe_name.lower().endswith(".pdf"):
        raise HTTPException(status_code=404, detail="Document not found")

    document_path = COMMODITY_CERTIFICATE_OUTPUT_DIR / safe_name
    if not document_path.exists() or not document_path.is_file():
        legacy_document_path = REPO_ROOT / "frontend" / "public" / "generated" / safe_name
        if legacy_document_path.exists() and legacy_document_path.is_file():
            document_path = legacy_document_path
        else:
            raise HTTPException(status_code=404, detail="Document not found")

    disposition = "attachment" if download else "inline"
    return FileResponse(
        path=document_path,
        media_type="application/pdf",
        filename=safe_name,
        headers={"Content-Disposition": f'{disposition}; filename="{safe_name}"'},
    )

PERSONAL_COMPLETION_FIELDS = [
    "levelOfEducation",
    "maritalStatus",
    "dependents",
    "houseType",
]

PERSONAL_COMPLETION_LABELS = {
    "levelOfEducation": "Level of education",
    "maritalStatus": "Marital Status",
    "dependents": "No. of dependents",
    "houseType": "House Type",
}

PERSONAL_COMPLETION_OPTIONS = {
    "levelOfEducation": [
        "Graduation",
        "Primary Education",
        "Intermediate (Middle School)",
        "Secondary (High School)",
        "Diploma (Associate / Intermediate)",
        "Bachelor's Degree",
        "Master's Degree",
        "Doctorate (PhD)",
    ],
    "maritalStatus": [
        "Single",
        "Married",
        "Divorced",
        "Widowed",
        "Separated",
        "Polygamous",
    ],
    "dependents": ["0", "1", "2", "3", "4", "5", "6+"],
    "houseType": [
        "Villa",
        "Owned Villa",
        "Owned Apartment",
        "Owned Traditional House",
        "Rented Apartment",
        "Rented Villa",
        "Company Provided Accommodation",
        "Shared Accommodation",
        "Family Owned (Not in applicant name)",
        "Government Housing",
    ],
}

PERSONAL_COMPLETION_STAGE_AWAITING_PROCEED = "awaiting_proceed"
PERSONAL_COMPLETION_STAGE_COLLECTING = "collecting"
PERSONAL_COMPLETION_STAGE_COMPLETE = "complete"

EXPENSE_BREAKDOWN_DEFAULT = {
    "housing": "3000",
    "food": "1500",
    "utilities": "760",
    "healthcare": "500",
    "transportation": "1000",
    "education": "800",
}

ETB_EXPENSES_TOTAL = 7560

PREAPPROVED_ETB_AMOUNT = 60000
DEFAULT_MONTHLY_INCOME = 35650.0
OPEN_BANKING_MONTHLY_INCOME = 41250.0
DEFAULT_MONTHLY_OBLIGATIONS = 8750.0
DEFAULT_CREDIT_CARD_LIMIT = 20000.0
DEFAULT_OFFER_TENURE = 60

BUREAU_CONSENT_OTP_PROMPT = (
    "Before we proceed, please provide your consent to retrieve your credit bureau records from SIMAH. "
    "Please enter the Absher OTP sent to your registered mobile number to verify your consent and enable us to fetch your SIMAH bureau data."
)

FINAL_DISBURSEMENT_OTP_PROMPT = "Please enter the 4-digit OTP sent to your registered mobile number."
OTP_RETRY_PROMPT = "The entered OTP is incorrect. Please re-enter the correct OTP."

OTP_WORD_DIGITS = {
    "zero": "0",
    "oh": "0",
    "o": "0",
    "one": "1",
    "won": "1",
    "two": "2",
    "to": "2",
    "too": "2",
    "three": "3",
    "four": "4",
    "for": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "ate": "8",
    "nine": "9",
}

OTP_MULTIPLIERS = {
    "double": 2,
    "triple": 3,
}

OTP_CONTEXT_HINTS = (
    "otp",
    "code",
    "pin",
    "passcode",
    "verification",
    "simah",
    "absher",
)

CONTINUATION_PHRASES = (
    "yes",
    "yep",
    "yeah",
    "sure",
    "ok",
    "ohk",
    "okay",
    "alright",
    "begin",
    "start",
    "lets begin",
    "let's begin",
    "start journey",
    "begin journey",
    "proceed",
    "continue",
    "go ahead",
    "go on",
    "please proceed",
    "please continue",
    "carry on",
    "move on",
    "yes proceed",
    "proceed please",
    "confirm",
    "confirmed",
    "i confirm",
)

DECLINE_PHRASES = (
    "no",
    "nope",
    "not now",
    "not yet",
    "later",
    "skip",
    "cancel",
    "stop",
    "hold on",
    "wait",
)


def _extract_digit_tokens(text: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+", (text or "").lower())
    digits: list[str] = []
    i = 0
    while i < len(tokens):
        token = tokens[i]
        multiplier = OTP_MULTIPLIERS.get(token)
        if multiplier and i + 1 < len(tokens):
            next_token = tokens[i + 1]
            mapped = OTP_WORD_DIGITS.get(next_token)
            if mapped is not None:
                digits.extend([mapped] * multiplier)
                i += 2
                continue

        if token in OTP_WORD_DIGITS:
            digits.append(OTP_WORD_DIGITS[token])
        elif token.isdigit():
            digits.extend(list(token))
        i += 1
    return digits


def _looks_like_otp_attempt(text: str) -> bool:
    normalized = _normalize_chat_text(text)
    if not normalized:
        return False
    if re.search(r"\d", normalized):
        return True
    if any(word in normalized for word in OTP_CONTEXT_HINTS):
        return True
    return bool(_extract_digit_tokens(normalized))


def _extract_otp_from_message(text: str, expected_len: int = 4) -> str | None:
    normalized = _normalize_chat_text(text)
    if not normalized:
        return None

    exact_digits = re.sub(r"\D", "", normalized)
    if len(exact_digits) == expected_len:
        return exact_digits

    digit_tokens = _extract_digit_tokens(normalized)
    if len(digit_tokens) == expected_len:
        return "".join(digit_tokens)

    if len(digit_tokens) > expected_len and any(hint in normalized for hint in OTP_CONTEXT_HINTS):
        return "".join(digit_tokens[-expected_len:])

    return None


def _gateway_session_path(session_id: str) -> Path:
    safe_id = (session_id or "").replace("/", "_").replace("\\", "_").replace("..", "_")
    return GATEWAY_SESSION_DIR / f"{safe_id}.json"


def _load_gateway_session(session_id: str) -> dict | None:
    if mongo_journey and mongo_journey.is_available():
        return mongo_journey.get_session(session_id)

    path = _gateway_session_path(session_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return {k: v for k, v in data.items() if not k.startswith("_")}
    except (json.JSONDecodeError, OSError):
        logger.exception("Failed to load persisted gateway session %s", session_id)
        return None


def _store_gateway_session(session_id: str, session: dict) -> None:
    session["session_id"] = session_id
    SESSION_STORE[session_id] = session
    if mongo_journey and mongo_journey.is_available():
        mongo_journey.save_session(session_id, session)
        return

    path = _gateway_session_path(session_id)
    try:
        path.write_text(json.dumps({**session, "_saved_at": time.time()}, ensure_ascii=False, default=str), encoding="utf-8")
    except OSError:
        logger.exception("Failed to persist gateway session %s", session_id)


def _is_completed_journey_session(session: dict | None) -> bool:
    return bool(session and session.get("step") == "done" and session.get("sub_step") == "complete")


def _default_gateway_session(session_id: str) -> dict:
    return {
        "session_id": session_id,
        "region": "SA",
        "step": "identity",
        "sub_step": "awaiting_id",
        "step_number": 1,
        "total_steps": 5,
        "product": "cash_finance",
        "user_type": "unknown",
        "customerType": "UNKNOWN",
        "journeyMode": "PRE_DEDUPE",
        "journeyOrigin": "UNKNOWN",
        "transitionReason": None,
        "collected": {},
        "offer": {},
        "finance_summary": {},
        "disbursement": {},
        "_lastWidgetState": "identity/awaiting_id",
    }


def _delete_gateway_journey(session_id: str) -> None:
    SESSION_STORE.pop(session_id, None)
    if mongo_journey and mongo_journey.is_available():
        mongo_journey.delete_journey(session_id)

    try:
        _gateway_session_path(session_id).unlink(missing_ok=True)
    except OSError:
        logger.exception("Failed to delete gateway session %s", session_id)


def _is_missing_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned == "" or cleaned == "-"
    return False


def _get_personal_completion_state(session: dict) -> dict[str, Any] | None:
    profile = _build_personal_widget_data(session, session.get("session_id", ""))
    personal = profile.get("personal", {}) if isinstance(profile, dict) else {}
    address = profile.get("address", {}) if isinstance(profile, dict) else {}

    values = {
        "levelOfEducation": personal.get("levelOfEducation"),
        "maritalStatus": personal.get("maritalStatus"),
        "dependents": personal.get("dependents"),
        "houseType": address.get("houseType"),
    }

    missing_fields = [field for field in PERSONAL_COMPLETION_FIELDS if _is_missing_value(values.get(field))]
    if not missing_fields:
        return None

    return {
        "missing_fields": missing_fields,
        "current_field": missing_fields[0],
    }


def _build_personal_completion_prompt(field_key: str) -> str:
    label = PERSONAL_COMPLETION_LABELS.get(field_key, field_key)
    return f"Please choose your {label} from the options below to complete your profile."


def _build_personal_completion_options(field_key: str) -> list[dict[str, str]]:
    options = PERSONAL_COMPLETION_OPTIONS.get(field_key, [])
    return [
        {"id": f"{field_key}_{idx}", "label": option, "value": option}
        for idx, option in enumerate(options)
    ]


def _ensure_expenses_prefilled(session: dict) -> None:
    if session.get("expenses_prefilled"):
        return
    if session.get("income_verification_method") in {"open_banking", "upload_statement"}:
        _prefill_open_banking_expenses(session)
        return
    if session.get("ntb_open_banking_income_verified"):
        _prefill_open_banking_expenses(session)
        return


def _prefill_open_banking_expenses(session: dict) -> None:
    session["income_verification_method"] = "open_banking"
    session["ntb_open_banking_income_verified"] = True
    if session.get("expenses_prefilled"):
        return
    session["expenses_prefilled"] = True
    session["expenses_total"] = ETB_EXPENSES_TOTAL
    session["expenses_breakdown"] = dict(EXPENSE_BREAKDOWN_DEFAULT)
    expenses = session.setdefault("expenses", {})
    expenses["breakdown"] = session["expenses_breakdown"]
    expenses["total"] = ETB_EXPENSES_TOTAL


def _start_expenses_saving(session: dict) -> None:
    expenses = session.setdefault("expenses", {})
    if "breakdown" not in expenses and session.get("expenses_breakdown"):
        expenses["breakdown"] = session.get("expenses_breakdown")
    if "total" not in expenses and session.get("expenses_total") is not None:
        expenses["total"] = session.get("expenses_total")
    session["expenses_editing"] = False
    session["sub_step"] = "expenses_saving"


def _normalize_chat_text(text: str) -> str:
    normalized = (text or "").lower().strip()
    if normalized.startswith("__sys__"):
        normalized = normalized[7:].strip()
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def _contains_phrase(text: str, phrase: str) -> bool:
    pattern = rf"(?<!\w){re.escape(phrase)}(?!\w)"
    return bool(re.search(pattern, text))


def _is_decline_message(text: str) -> bool:
    normalized = _normalize_chat_text(text)
    if not normalized:
        return False
    return any(_contains_phrase(normalized, phrase) for phrase in DECLINE_PHRASES)


def _is_continuation_message(text: str) -> bool:
    normalized = _normalize_chat_text(text)
    if not normalized or _is_decline_message(normalized):
        return False
    return any(_contains_phrase(normalized, phrase) for phrase in CONTINUATION_PHRASES)


def _looks_like_offer_continue_message(text: str) -> bool:
    normalized = _normalize_chat_text(text)
    if not normalized or _is_decline_message(normalized):
        return False
    if _is_continuation_message(normalized):
        return True
    if re.search(r"(?<!\w)continu\w*(?!\w)", normalized):
        return True
    if re.search(r"(?<!\w)proce\w*(?!\w)", normalized):
        return True
    if _contains_phrase(normalized, "review details"):
        return True
    if _contains_phrase(normalized, "review") and _contains_phrase(normalized, "detail"):
        return True
    return False


def _looks_like_general_question(raw_text: str, session: dict | None = None) -> bool:
    text = (raw_text or "").strip()
    normalized = _normalize_chat_text(text)
    if not normalized:
        return False
    if text.lower().startswith("__sys__"):
        return False
    if re.fullmatch(r"[12]\d{9}", normalized) or re.fullmatch(r"\d{4}", normalized) or re.fullmatch(r"\d{6}", normalized):
        return False
    if looks_like_fallback_interruption and looks_like_fallback_interruption(raw_text, session or {}):
        return True
    if _is_continuation_message(normalized) or _is_decline_message(normalized):
        return False
    if normalized.startswith(("update_personal", "update_address", "update_employment", "update_income", "update_expenses")):
        return False
    if normalized.startswith(("document_uploaded:", "profile_completion:")):
        return False

    question_starters = (
        "what", "why", "how", "when", "where", "which", "who",
        "can you", "could you", "do i", "does", "is", "are",
        "will", "would", "should", "tell me", "explain", "describe",
    )
    if "?" in text:
        return True
    return any(normalized.startswith(starter) for starter in question_starters)


def _answer_gateway_question(raw_text: str, session: dict) -> str | None:
    is_question = _looks_like_general_question(raw_text, session)
    if not is_question:
        return None
    if answer_gateway_general_query:
        try:
            faq = answer_gateway_general_query(raw_text, session)
            if faq and faq.get("text"):
                answer = str(faq["text"])
                return compose_fallback_response(answer, session) if compose_fallback_response else answer
        except Exception:
            logger.exception("Failed to answer gateway FAQ question")
    answer = (
        "I do not have an exact prepared answer for that question yet, but I have kept your application "
        "at the same step. Please rephrase it around the Cash Finance journey, documents, eligibility, "
        "verification, offer, signing, or disbursement and I will help from there."
    )
    return compose_fallback_response(answer, session) if compose_fallback_response else answer


async def _answer_gateway_question_with_agent(raw_text: str, session_id: str, session: dict) -> str | None:
    is_question = _looks_like_general_question(raw_text, session)
    if not is_question:
        return None
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                f"{AGENT_URL}/answer_question",
                json={
                    "session_id": session_id,
                    "message": raw_text,
                    "session": session,
                },
            )
        if resp.status_code == 200:
            data = resp.json()
            answer = (data.get("response") or "").strip()
            if answer:
                return compose_fallback_response(answer, session) if compose_fallback_response else answer
        logger.warning("Agent question endpoint returned status=%s body=%s", resp.status_code, resp.text[:500])
    except Exception:
        logger.exception("Failed to answer question through agent endpoint")
    return _answer_gateway_question(raw_text, session)


def _extract_prefixed_json_payload(text: str, prefix: str) -> dict[str, Any] | None:
    pattern = rf"^\s*(?:__SYS__)?{re.escape(prefix)}\s*:\s*(\{{[\s\S]*\}})\s*$"
    match = re.match(pattern, text or "", flags=re.IGNORECASE)
    if not match:
        return None
    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def _apply_deterministic_profile_update(session: dict, command: str, payload: dict[str, Any]) -> str | None:
    if command == "UPDATE_PERSONAL":
        _persist_profile_update(session, "personal", {
            "levelOfEducation": payload.get("levelOfEducation"),
            "maritalStatus": payload.get("maritalStatus"),
            "dependents": payload.get("dependents"),
            "email": payload.get("email"),
        })
        return "Personal Details"

    if command == "UPDATE_ADDRESS":
        _persist_profile_update(session, "address", {
            "line1": payload.get("line1"),
            "line2": payload.get("line2"),
            "street": payload.get("street"),
            "city": payload.get("city"),
            "postalCode": payload.get("postalCode"),
            "houseType": payload.get("houseType"),
        })
        return "Address Details"

    if command == "UPDATE_EMPLOYMENT":
        _persist_profile_update(session, "employment", {
            "type": payload.get("type"),
            "industry": payload.get("industry"),
            "employer": payload.get("employer"),
            "experience": payload.get("experience"),
            "workAddress": payload.get("workAddress"),
        })
        return "Employment Details"

    if command == "UPDATE_INCOME":
        _persist_profile_update(session, "income", {
            "monthly": payload.get("monthly"),
            "obligations": payload.get("obligations"),
            "creditCardLimit": payload.get("creditCardLimit"),
        })
        return "Income Details"

    if command == "UPDATE_EXPENSES":
        breakdown = payload.get("breakdown") if isinstance(payload.get("breakdown"), dict) else {}
        if breakdown:
            session["expenses_breakdown"] = breakdown
            session["expenses"] = {**(session.get("expenses") or {}), "breakdown": breakdown}
        total_expenses = payload.get("totalExpenses")
        if total_expenses is not None:
            session["expenses_total"] = total_expenses
            session["expenses"] = {**(session.get("expenses") or {}), "total": total_expenses}
        session["expenses_editing"] = False
        return "Monthly Expenses"

    return None


def _stage_pending_profile_update(session: dict, section: str, updates: dict[str, Any]) -> None:
    key = f"pending_{section}_update"
    session[key] = updates


def _extract_income_amount(text: str) -> int | None:
    normalized = (text or "").strip()
    if not normalized or normalized.lower().startswith(("__sys__", "document_uploaded:")):
        return None

    for match in re.finditer(r"\b(?:sar\s*)?(\d[\d,]{3,})(?:\.\d+)?\b", normalized, flags=re.IGNORECASE):
        amount = int(match.group(1).replace(",", ""))
        if 5_000 <= amount <= 200_000:
            return amount
    return None


def _parse_currency_amount(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    match = re.search(r"-?\d[\d,]*(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return None


def _is_open_banking_income_selected(session: dict) -> bool:
    return (
        session.get("income_verification_method") == "open_banking"
        or session.get("pending_income_verification") == "open_banking"
        or bool(session.get("ntb_open_banking_income_verified"))
    )


def _pick_first_positive_amount(*values: Any, fallback: float) -> float:
    for value in values:
        parsed = _parse_currency_amount(value)
        if parsed is not None and parsed > 0:
            return parsed
    return fallback


def _resolve_eligibility_inputs(session: dict) -> dict[str, float | int]:
    collected = session.get("collected") if isinstance(session.get("collected"), dict) else {}
    profile = session.get("customer_profile") if isinstance(session.get("customer_profile"), dict) else {}
    profile_income = profile.get("income") if isinstance(profile.get("income"), dict) else {}
    pending_income = session.get("pending_income_update") if isinstance(session.get("pending_income_update"), dict) else {}

    if _is_open_banking_income_selected(session):
        monthly_income = OPEN_BANKING_MONTHLY_INCOME
    else:
        monthly_income = _pick_first_positive_amount(
            collected.get("monthly_income"),
            profile_income.get("monthly"),
            pending_income.get("monthly"),
            fallback=DEFAULT_MONTHLY_INCOME,
        )

    monthly_obligations = _pick_first_positive_amount(
        collected.get("monthly_obligations"),
        profile_income.get("obligations"),
        pending_income.get("obligations"),
        fallback=DEFAULT_MONTHLY_OBLIGATIONS,
    )
    credit_card_limit = _pick_first_positive_amount(
        collected.get("credit_card_limit"),
        profile_income.get("creditCardLimit"),
        pending_income.get("creditCardLimit"),
        fallback=DEFAULT_CREDIT_CARD_LIMIT,
    )

    tenure_months = int(session.get("offer", {}).get("max_tenure") or DEFAULT_OFFER_TENURE)

    session.setdefault("collected", {})
    session["collected"]["monthly_income"] = int(round(monthly_income))
    session["collected"]["monthly_obligations"] = int(round(monthly_obligations))
    session["collected"]["credit_card_limit"] = int(round(credit_card_limit))

    return {
        "monthly_income": monthly_income,
        "monthly_obligations": monthly_obligations,
        "credit_card_limit": credit_card_limit,
        "tenure_months": max(1, tenure_months),
    }


def _build_offer_from_eligibility(session: dict) -> dict[str, Any]:
    inputs = _resolve_eligibility_inputs(session)
    eligibility_result = calculate_max_eligible_amount(
        monthly_income=float(inputs["monthly_income"]),
        monthly_obligations=float(inputs["monthly_obligations"]),
        credit_card_limit=float(inputs["credit_card_limit"]),
        tenure_months=int(inputs["tenure_months"]),
        region=session.get("region", "SA"),
    )
    return {
        "max_amount": int(eligibility_result.get("max_amount") or eligibility_result.get("estimated_amount", 0)),
        "profit_rate": "6.1%",
        "max_tenure": int(inputs["tenure_months"]),
        "foir_status": eligibility_result.get("foir_status", "ELIGIBLE"),
    }


def _apply_pending_income_amount(session: dict, amount: int) -> None:
    monthly = f"SAR {amount}"
    pending = session.get("pending_income_update") if isinstance(session.get("pending_income_update"), dict) else {}
    profile = _ensure_session_customer_profile(session)
    income = profile.setdefault("income", {})

    income["monthly"] = monthly
    session.setdefault("collected", {})["monthly_income"] = amount
    session["customer_profile"] = profile
    session["pending_income_update"] = {
        **pending,
        "monthly": monthly,
        "obligations": pending.get("obligations") or income.get("obligations"),
        "creditCardLimit": pending.get("creditCardLimit") or income.get("creditCardLimit"),
    }


def _finalize_pending_profile_update(session: dict, section: str) -> bool:
    key = f"pending_{section}_update"
    updates = session.pop(key, None)
    if not isinstance(updates, dict):
        return False
    if section == "income" and session.get("pending_income_verification") == "open_banking":
        updates = {
            **updates,
            "monthly": "SAR 41250",
        }
    _persist_profile_update(session, section, updates)
    return True


UPDATE_SECTION_PROFILE_KEYS = {
    "Personal Details": "personal",
    "Address Details": "address",
    "Employment Details": "employment",
    "Income Details": "income",
}


def _ensure_session_customer_profile(session: dict) -> dict[str, Any]:
    profile = session.get("customer_profile")
    if isinstance(profile, dict) and profile:
        return profile
    hydrated = _build_personal_widget_data(session, session.get("session_id", "")) or {}
    session["customer_profile"] = hydrated if isinstance(hydrated, dict) else {}
    return session["customer_profile"]


def _hydrate_customer_profile_if_available(session: dict, session_id: str) -> dict[str, Any] | None:
    profile = session.get("customer_profile")
    if isinstance(profile, dict) and profile:
        return profile

    national_id = session.get("collected", {}).get("id_number")
    if not national_id:
        return None

    customer = get_customer_by_national_id(national_id)
    if not customer:
        phone = _get_phone_from_session_id(session_id) or session.get("collected", {}).get("phone_number", "")
        customer = get_customer_by_phone(phone) if phone else None

    if not customer:
        return None

    session["customer_profile"] = _customer_to_widget_data(customer)
    return session["customer_profile"]


def _persist_profile_update(session: dict, section: str, updates: dict[str, Any]) -> dict[str, Any]:
    """Apply widget edits to the current journey session only."""
    profile = _ensure_session_customer_profile(session)

    if section == "personal":
        personal = profile.setdefault("personal", {})
        if updates.get("levelOfEducation") is not None:
            personal["levelOfEducation"] = str(updates.get("levelOfEducation", "")).strip()
        if updates.get("maritalStatus") is not None:
            personal["maritalStatus"] = str(updates.get("maritalStatus", "")).strip()
        if updates.get("dependents") is not None:
            personal["dependents"] = str(updates.get("dependents", "")).strip()
        if updates.get("email") is not None:
            profile["email"] = str(updates.get("email", "")).strip()

    elif section == "address":
        address = profile.setdefault("address", {})
        for key in ("line1", "line2", "street", "city", "postalCode", "houseType"):
            if updates.get(key) is not None:
                address[key] = str(updates.get(key, "")).strip()

    elif section == "employment":
        employment = profile.setdefault("employment", {})
        for key in ("type", "industry", "employer", "experience"):
            if updates.get(key) is not None:
                employment[key] = str(updates.get(key, "")).strip()
        work_address_in = updates.get("workAddress") if isinstance(updates.get("workAddress"), dict) else {}
        if isinstance(work_address_in, dict):
            work_address = employment.setdefault("workAddress", {})
            for key in ("line1", "city", "postalCode"):
                if work_address_in.get(key) is not None:
                    work_address[key] = str(work_address_in.get(key, "")).strip()

    elif section == "income":
        income = profile.setdefault("income", {})
        for key in ("monthly", "obligations", "creditCardLimit"):
            if updates.get(key) is not None:
                income[key] = str(updates.get(key, "")).strip()
        monthly_income = _parse_currency_amount(income.get("monthly"))
        monthly_obligations = _parse_currency_amount(income.get("obligations"))
        credit_card_limit = _parse_currency_amount(income.get("creditCardLimit"))
        session.setdefault("collected", {})
        if monthly_income is not None and monthly_income > 0:
            session["collected"]["monthly_income"] = int(round(monthly_income))
        if monthly_obligations is not None and monthly_obligations > 0:
            session["collected"]["monthly_obligations"] = int(round(monthly_obligations))
        if credit_card_limit is not None and credit_card_limit > 0:
            session["collected"]["credit_card_limit"] = int(round(credit_card_limit))

    session["customer_profile"] = profile
    return profile


def _build_personal_completion_gate_options() -> list[dict[str, str]]:
    return [
        {"id": "profile_completion_proceed", "label": "Proceed", "value": "proceed"},
        {"id": "profile_completion_later", "label": "Not now", "value": "not_now"},
    ]


def _fast_state_response(session: dict) -> str | None:
    step = session.get("step", "identity")
    sub_step = session.get("sub_step", "")

    if step == "identity" and sub_step == "personal_details":
        return "I have retrieved your current profile details. Please review them to make sure everything is correct to proceed."

    if step == "identity" and sub_step == "modify_address_choice":
        return "Would you like to update your existing address or add a new address?"

    if step == "identity" and sub_step == "modify_income_proof_choice":
        return "Please choose how you'd like to verify your income."

    if step == "identity" and sub_step == "modify_employment_document_pending":
        return "Please upload your employment verification document below."

    if step == "identity" and sub_step == "modify_income_upload_statement":
        return "Please upload your bank statement below."

    if step == "identity" and sub_step == "open_banking_email_sent":
        return "An email has been sent to your registered ID. Please link your account."

    if step == "identity" and sub_step == "open_banking_linked":
        return "We are updating your details now. Please wait while we save the changes."

    if step == "identity" and sub_step == "expenses":
        if session.get("expenses_editing"):
            return "Edit the category amounts below, then save your changes."
        return "Please review your monthly expenses below, or choose Modify if you want to edit the breakdown."

    if step == "identity" and sub_step == "updating_details":
        return "We are updating your details now. Please wait while we save the changes."

    return None


def _apply_personal_completion_value(session: dict, field_key: str, value: str) -> None:
    cleaned = value.strip()
    if field_key in {"levelOfEducation", "maritalStatus", "dependents"}:
        _persist_profile_update(session, "personal", {field_key: cleaned})
    elif field_key == "houseType":
        _persist_profile_update(session, "address", {"houseType": cleaned})


def _get_phone_from_session_id(session_id: str) -> str:
    """Session IDs are formatted as '<phone>_<product>' for this app."""
    return session_id.split("_", 1)[0] if session_id else ""


def _clean_otp_phone(phone: str) -> str:
    return (phone or "").strip().replace(" ", "").removeprefix("+966")


def _get_otp_phone_from_session(session: dict, session_id: str) -> str:
    return _clean_otp_phone(_get_phone_from_session_id(session_id) or session.get("collected", {}).get("phone_number", ""))


def _ensure_bureau_otp_sent(session: dict, session_id: str) -> None:
    if session.get("bureau_otp_sent"):
        return
    phone = _get_otp_phone_from_session(session, session_id)
    if not phone:
        logger.warning("Unable to send bureau OTP because phone is missing for session %s", session_id)
        return
    result = send_otp(phone, purpose="bureau")
    session["bureau_otp_sent"] = bool(result.get("success"))
    session["bureau_otp_whatsapp_sent"] = bool(result.get("whatsapp_sent"))
    if not result.get("success"):
        session["bureau_otp_error"] = result.get("error") or "Unable to send OTP. Please try again."


def _verify_bureau_otp(session: dict, session_id: str, otp: str) -> bool:
    phone = _get_otp_phone_from_session(session, session_id)
    if not phone or not otp:
        return False
    return verify_otp(phone, otp, purpose="bureau")


def _ensure_disbursement_otp_sent(session: dict, session_id: str) -> None:
    if session.get("disbursement_otp_sent"):
        return
    phone = _get_otp_phone_from_session(session, session_id)
    if not phone:
        logger.warning("Unable to send disbursement OTP because phone is missing for session %s", session_id)
        return
    result = send_otp(phone, purpose="login")
    session["disbursement_otp_sent"] = bool(result.get("success"))
    session["disbursement_otp_whatsapp_sent"] = bool(result.get("whatsapp_sent"))
    if not result.get("success"):
        session["disbursement_otp_error"] = result.get("error") or "Unable to send OTP. Please try again."


def _verify_disbursement_otp(session: dict, session_id: str, otp: str) -> bool:
    phone = _get_otp_phone_from_session(session, session_id)
    if not phone or not otp:
        return False
    return verify_otp(phone, otp, purpose="login")


def _customer_to_widget_data(customer: Any) -> dict:
    """Map backend CustomerProfile model into the widget's expected payload shape."""
    def _address_to_widget_data(address: Any) -> dict:
        if not address:
            return {}
        return {
            "line1": address.line1,
            "line2": address.line2,
            "street": address.street,
            "city": address.city,
            "postalCode": address.postal_code,
            "houseType": address.house_type,
        }

    return {
        "name": customer.name,
        "phone": customer.phone,
        "email": customer.email,
        "personal": {
            "idNumber": customer.personal.id_number,
            "idExpirationDate": customer.personal.id_expiration_date or "26/08/2027",
            "nationality": customer.personal.nationality,
            "levelOfEducation": customer.personal.education,
            "maritalStatus": customer.personal.marital_status,
            "dependents": customer.personal.dependents,
        },
        "address": _address_to_widget_data(customer.address),
        "employment": {
            "type": customer.employment.type,
            "industry": customer.employment.industry,
            "employer": customer.employment.employer,
            "experience": customer.employment.experience,
            "workAddress": _address_to_widget_data(customer.employment.work_address),
        },
        "income": {
            "monthly": customer.income.monthly,
            "obligations": customer.income.obligations,
            "creditCardLimit": customer.income.credit_card_limit,
        },
    }


def _merge_widget_profile(base: Any, overlay: Any) -> dict:
    """Merge session profile data over a complete customer snapshot without dropping untouched fields."""
    def _clone(value: Any):
        if isinstance(value, dict):
            return {k: _clone(v) for k, v in value.items()}
        if isinstance(value, list):
            return [_clone(v) for v in value]
        return value

    def _merge_dicts(left: dict, right: dict) -> dict:
        result = {k: _clone(v) for k, v in left.items()}
        for key, value in right.items():
            if isinstance(value, dict):
                existing = result.get(key)
                if isinstance(existing, dict):
                    result[key] = _merge_dicts(existing, value)
                elif value:
                    result[key] = _merge_dicts({}, value)
            elif value not in (None, ""):
                result[key] = value
        return result

    base_dict = base if isinstance(base, dict) else {}
    overlay_dict = overlay if isinstance(overlay, dict) else {}
    return _merge_dicts(base_dict, overlay_dict)


def _build_personal_widget_data(session: dict, session_id: str = "") -> dict:
    """Build a full personal-details payload by combining the live session with persisted customer data."""
    complete_profile: dict[str, Any] = {}
    national_id = session.get("collected", {}).get("id_number", "")
    if national_id:
        customer = get_customer_by_national_id(national_id)
        if customer:
            complete_profile = _customer_to_widget_data(customer)
    if not complete_profile:
        phone = _get_phone_from_session_id(session_id) or session.get("collected", {}).get("phone_number", "")
        if phone:
            customer = get_customer_by_phone(phone)
            if customer:
                complete_profile = _customer_to_widget_data(customer)

    return _merge_widget_profile(complete_profile, session.get("customer_profile"))


def _build_application_summary_data(session: dict) -> dict:
    profile = _build_personal_widget_data(session, session.get("session_id", ""))
    collected = session.get("collected", {})
    finance = session.get("finance_summary", {})
    account = session.get("selected_account", {})
    customer_type = session.get("customerType") or ("ETB" if session.get("user_type") == "existing" else "NTB")

    if customer_type == "ETB" and not account.get("iban"):
        national_id = collected.get("id_number", "")
        registered_ibans = get_etb_registered_ibans(national_id) if national_id else []
        if registered_ibans:
            account = registered_ibans[0]

    # Ensure bank/beneficiary are populated from IBAN master when only IBAN is present.
    if account.get("iban") and (not account.get("bank") or not account.get("beneficiary")):
        try:
            from utils.eligibility import validate_iban
            iban_lookup = validate_iban(account.get("iban", ""))
            if iban_lookup.get("valid"):
                if not account.get("bank"):
                    account["bank"] = iban_lookup.get("bank", "")
                if not account.get("beneficiary"):
                    account["beneficiary"] = iban_lookup.get("beneficiary", "")
        except Exception:
            logger.exception("Failed to derive account details from IBAN for application summary.")

    personal = profile.get("personal", {})
    return {
        "personalDetails": {
            "name": profile.get("name") or collected.get("full_name") or "Customer",
            "idNumber": personal.get("idNumber") or collected.get("id_number", "****"),
            "phone": profile.get("phone") or collected.get("phone_number") or "+966 ***",
        },
        "financeSummary": {
            "amount": finance.get("amount", 0),
            "tenure": finance.get("tenure", 60),
            "profit_rate": finance.get("profit_rate", "6.1%"),
            "monthly_installment": finance.get("monthly_installment", 0),
            "total_payable": finance.get("total_payable", 0),
        },
        "account": {
            "bank": account.get("bank", "Unknown"),
            "iban": account.get("iban", ""),
            "beneficiary": account.get("beneficiary", ""),
        },
        "is_etb": customer_type == "ETB",
    }


# ── Helpers ──────────────────────────────────────────────────────────

def _generate_certificate_number(length: int = 20) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choices(alphabet, k=length))


def _ensure_higher_amount_workitem(session: dict) -> dict:
    workitem = session.setdefault("backoffice_workitem", {})
    if not workitem.get("applicationId"):
        workitem["applicationId"] = str(random.randint(100000, 999999))
    workitem.update({
        "customerId": session.get("collected", {}).get("id_number", ""),
        "requestedAmount": session.get("requested_amount", "above_eligible_limit"),
        "maxEligible": session.get("offer", {}).get("max_amount", 0),
        "branch": "Riyadh",
        "remarks": "Customer requested amount above automatic eligible limit. Application submitted for manual specialist review.",
    })
    return workitem


def _select_browser_executable() -> Path | None:
    for candidate in CHROME_CANDIDATES:
        if candidate.exists():
            return candidate
    return None


def _resolve_commodity_certificate_amount(session: dict) -> int:
    finance = session.setdefault("finance_summary", {})
    amount = finance.get("amount") or session.get("finance_amount")
    if not amount:
        amount = session.get("offer", {}).get("selected_amount") or session.get("offer", {}).get("max_amount") or 0
    amount = int(amount or 0)
    finance["amount"] = amount
    session["finance_amount"] = amount
    return amount


def _render_commodity_certificate_html(session: dict) -> str:
    if not COMMODITY_CERTIFICATE_TEMPLATE.exists():
        raise FileNotFoundError(f"Commodity certificate template not found: {COMMODITY_CERTIFICATE_TEMPLATE}")

    template = COMMODITY_CERTIFICATE_TEMPLATE.read_text(encoding="utf-8")
    certificate_state = session.setdefault("commodity_certificate", {})
    certificate_number = certificate_state.get("certificateNumber") or _generate_certificate_number()
    certificate_state["certificateNumber"] = certificate_number

    finance_amount = _resolve_commodity_certificate_amount(session)
    current_date = datetime.datetime.now().strftime("%d %B %Y")
    volume = finance_amount / COMMODITY_CERTIFICATE_PRICE if COMMODITY_CERTIFICATE_PRICE else 0.0

    replacements = {
        "&certificateNumber&": html.escape(certificate_number),
        "$certificateNumber$": html.escape(certificate_number),
        "&CurrentDate&": html.escape(current_date),
        "$CurrentDate$": html.escape(current_date),
        "&Volume&": f"{volume:.2f}",
        "$Volume$": f"{volume:.2f}",
        "&Value&": f"{finance_amount:,.0f}",
        "$Value$": f"{finance_amount:,.0f}",
    }

    rendered = template
    for placeholder, value in replacements.items():
        rendered = rendered.replace(placeholder, value)
    return rendered


def _ensure_commodity_certificate_pdf(session: dict) -> str:
    existing_url = session.get("commodity_certificate_url")
    if existing_url:
        existing_filename = session.get("commodity_certificate", {}).get("pdf_filename") or Path(str(existing_url)).name
        existing_path = COMMODITY_CERTIFICATE_OUTPUT_DIR / existing_filename
        if existing_path.exists():
            return existing_url

    COMMODITY_CERTIFICATE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    session_id = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(session.get("session_id", "session")))
    pdf_path = COMMODITY_CERTIFICATE_OUTPUT_DIR / f"CommodityCertificate_{session_id}.pdf"
    _write_commodity_certificate_pdf(session, pdf_path)
    session["commodity_certificate_url"] = f"/api/chat/generated-documents/{pdf_path.name}"
    session.setdefault("commodity_certificate", {})["pdf_filename"] = pdf_path.name
    session.setdefault("commodity_certificate", {})["pdf_url"] = session["commodity_certificate_url"]
    return session["commodity_certificate_url"]


def _pdf_escape_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _wrap_pdf_text(value: str, width: int = 92) -> list[str]:
    return textwrap.wrap(value, width=width, break_long_words=False, break_on_hyphens=False) or [""]


def _pdf_text_command(x: int, y: int, text: str, font: str = "F1", size: int = 12) -> str:
    return f"BT /{font} {size} Tf 1 0 0 1 {x} {y} Tm ({_pdf_escape_text(text)}) Tj ET"


def _compose_pdf_document(page_streams: list[str]) -> bytes:
    objects: list[bytes] = []

    def add_object(payload: str) -> None:
        objects.append(payload.encode("latin-1"))

    add_object("<< /Type /Catalog /Pages 2 0 R >>")
    page_refs = " ".join(f"{idx} 0 R" for idx in range(3, 3 + len(page_streams)))
    add_object(f"<< /Type /Pages /Kids [{page_refs}] /Count {len(page_streams)} >>")

    for page_number in range(len(page_streams)):
        content_obj = 5 + len(page_streams) + page_number
        add_object(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents {content_obj} 0 R >>"
        )

    add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>")
    add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>")

    for stream in page_streams:
        stream_bytes = stream.encode("latin-1")
        add_object(f"<< /Length {len(stream_bytes)} >>\nstream\n{stream}\nendstream")

    pdf = bytearray()
    pdf.extend(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")

    offsets: list[int] = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode("latin-1"))
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")

    xref_start = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))
    pdf.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF".encode("latin-1")
    )
    return bytes(pdf)


def _write_commodity_certificate_pdf(session: dict, pdf_path: Path) -> None:
    certificate_state = session.setdefault("commodity_certificate", {})
    certificate_number = certificate_state.get("certificateNumber") or _generate_certificate_number()
    certificate_state["certificateNumber"] = certificate_number
    finance_amount = _resolve_commodity_certificate_amount(session)
    current_date = datetime.datetime.now().strftime("%d %B %Y")
    volume = finance_amount / COMMODITY_CERTIFICATE_PRICE if COMMODITY_CERTIFICATE_PRICE else 0.0
    volume_text = f"{volume:.2f}"
    value_text = f"{finance_amount:,.0f}"

    page1: list[str] = []
    page1.append(_pdf_text_command(150, 790, f"Certificate Number: {certificate_number}", "F2", 18))
    intro_lines = _wrap_pdf_text(
        "This is to certify that the following transaction has been executed through the Saudi Finance Company in accordance with the Rules of Saudi Islamic Services Ltd.",
        88,
    )
    y = 748
    for line in intro_lines:
        page1.append(_pdf_text_command(60, y, line, "F1", 11))
        y -= 16

    page1.append(_pdf_text_command(60, y - 12, "Seller : Newgen Software", "F2", 11))
    page1.append(_pdf_text_command(60, y - 28, "Buyer : Newgen Software", "F2", 11))

    rows = [
        ("Bid No :", certificate_number),
        ("Reporting Time / Date :", current_date),
        ("Value Date :", current_date),
        ("Product Code / Description :", "Crude Palm Oil"),
        ("Unit :", "Tonnages"),
        ("Volume :", volume_text),
        ("Currency :", "SAR"),
        ("Price :", "3710.80"),
        ("Price (MYR Equivalent) :", ""),
        ("Value :", value_text),
        ("Transaction Type :", "BID"),
        ("Murabaha Value :", value_text),
    ]

    table_y = y - 70
    for label, value in rows:
        page1.append(_pdf_text_command(60, table_y, label, "F2", 11))
        page1.append(_pdf_text_command(250, table_y, value, "F1", 11))
        table_y -= 22

    page2: list[str] = []
    page2.append(_pdf_text_command(60, 790, "Notes :", "F2", 14))
    notes = [
        'This e-Certificate has the benefit of, and is generated pursuant to, the Rules of Saudi Islamic Services Ltd. ("Rules"). The Rules form an integral part hereof.',
        "This e-Certificate is valid only in the Saudi Finance Company. BMIS will not be responsible and be held liable for any loss or damage arising from any unauthorised use of this e-Certificate.",
        "This e-Certificate is governed by, and construed in accordance with, the laws of Saudi so long as it does not contradict with Shariah principles.",
        "This e-Certificate is a computer generated and does not require any signature.",
        "In the absence of manifest error by BMIS, the contents of this e-Certificate are conclusive and binding upon the Participants named herein.",
        "Any expression used in this e-Certificate has the same meaning as in the Rules.",
    ]
    note_y = 760
    for idx, note in enumerate(notes, start=1):
        wrapped = _wrap_pdf_text(f"{idx}. {note}", 88)
        for line in wrapped:
            page2.append(_pdf_text_command(60, note_y, line, "F1", 11))
            note_y -= 16
        note_y -= 8

    pdf_path.write_bytes(_compose_pdf_document(["\n".join(page1), "\n".join(page2)]))
    
def _resolve_step_tracker(step: str, sub_step: str, customer_type: str, session: dict) -> dict[str, int | bool]:
    """Return step tracker metadata for canonical journey entry points based on customer type and choices."""
    is_etb = customer_type == "ETB"
    higher_amount_requested = session.get("journeyMode") in {"HIGHER_AMOUNT", "NTB_ENRICHMENT"} or session.get("higher_amount_requested", False) or session.get("wants_more", False)

    if not is_etb:
        # NTB mapping
        tracker_map: dict[tuple[str, str], int] = {
            ("identity", "personal_details"): 1,
            ("offer", "pre_approved_offer"): 2,
            ("offer", "eligible"): 2,
            ("trade", "authorize"): 3,
            ("esign", "documents"): 4,
            ("disburse", "account"): 5,
        }
        total_steps = 5
    else:
        # ETB mapping
        if higher_amount_requested:
            tracker_map = {
                ("offer", "pre_approved_offer"): 1,
                ("identity", "personal_details"): 1,
                ("offer", "eligible"): 2,
                ("trade", "authorize"): 3,
                ("esign", "documents"): 4,
                ("disburse", "account"): 5,
            }
            total_steps = 5
        else:
            tracker_map = {
                ("offer", "pre_approved_offer"): 1,
                ("offer", "eligible"): 2,
                ("trade", "authorize"): 3,
                ("esign", "documents"): 4,
                ("disburse", "account"): 5,
            }
            total_steps = 5

    step_number = tracker_map.get((step, sub_step))
    if not step_number:
        return {"show_step_tracker": False, "tracker_total": total_steps}
    return {
        "show_step_tracker": True,
        "tracker_step": step_number,
        "tracker_total": total_steps,
    }


def resolve_widget(session: dict, extract: dict | None) -> dict | None:
    """Map step+sub_step to widget type + data payload."""
    step = session.get("step", "identity")
    sub_step = session.get("sub_step", "")
    customer_type = session.get("customerType") or ("ETB" if session.get("user_type") == "existing" else "NTB")
    journey_mode = session.get("journeyMode", "PRE_DEDUPE")
    tracker_data = _resolve_step_tracker(step, sub_step, customer_type, session)
    is_preapproved_path = customer_type == "ETB"

    if step == "identity" and sub_step == "nafath_pending":
        return {"widget": "NafathWidget", "data": {"nafath_code": session.get("nafath_code", math.floor(10 + random.random() * 89))}}

    if step == "identity" and sub_step == "loading":
        return {"widget": "LoadingWidget", "data": {"title": "Validating Credentials...", "subtitle": "Processing your secure request", "auto_advance_ms": 5000, "next_message": "loading_complete", "silent": True}}

    if step == "identity" and sub_step == "verified":
        return {"widget": "VerificationSuccessWidget", "data": {"title": "Identity Verified", "subtitle": "Your identity has been verified.", "auto_advance_ms": 3000, "next_message": "continue", "silent": True}}

    if step == "identity" and sub_step == "dedupe_check":
        return {"widget": "LoadingWidget", "data": {"title": "Running Dedupe Check...", "subtitle": "Fetching and Verifying your records", "auto_advance_ms": 3000, "next_message": "dedupe_complete", "silent": True}}

    if step == "identity" and sub_step == "identify_yourself":
        return {"widget": "NTBIntroductionWidget", "data": {}}

    if step == "identity" and sub_step == "personal_details":
        completion_state = _get_personal_completion_state(session)
        if session.get("profile_completion_stage") == PERSONAL_COMPLETION_STAGE_COLLECTING:
            return None
        show_actions = completion_state is None
        customer_type = session.get("customerType") or ("ETB" if session.get("user_type") == "existing" else "NTB")
        return {
            "widget": "PersonalDetailsWidget",
            "data": {
                **(_build_personal_widget_data(session, session.get("session_id", "")) or {
                "name": "Customer",
                "phone": "",
                "email": "",
                "personal": {
                    "idNumber": session.get("collected", {}).get("id_number", ""),
                    "idExpirationDate": "26/08/2027",
                    "nationality": "KSA",
                    "levelOfEducation": "",
                    "maritalStatus": "",
                    "dependents": "",
                },
                "address": {
                    "line1": "",
                    "line2": "",
                    "street": "",
                    "city": "",
                    "postalCode": "",
                    "houseType": ""
                },
                "employment": {
                    "type": "",
                    "industry": "",
                    "employer": "",
                    "experience": "",
                    "workAddress": {
                        "line1": "",
                        "street": "",
                        "city": "",
                        "postalCode": "",
                        "houseType": ""
                    }
                },
                "income": {
                    "monthly": "",
                    "obligations": "",
                    "creditCardLimit": ""
                }
                }),
                "is_etb": customer_type == "ETB",
                "showActions": show_actions,
                "missingFields": completion_state["missing_fields"] if completion_state else [],
                "currentMissingField": completion_state["current_field"] if completion_state else None,
                **tracker_data,
            }
        }

    if step == "identity" and sub_step == "modify_section":
        return {"widget": "ModifySectionWidget", "data": {}}

    if step == "identity" and sub_step == "modify_personal":
        profile = _build_personal_widget_data(session, session.get("session_id", "")) or session.get("customer_profile") or {}
        return {"widget": "ModifyPersonalWidget", "data": profile}

    if step == "identity" and sub_step == "modify_address":
        address_mode = session.get("modify_address_mode", "existing")
        profile = _build_personal_widget_data(session, session.get("session_id", "")) or session.get("customer_profile") or {}
        if address_mode == "new":
            profile = {
                **profile,
                "address": {
                    "line1": "",
                    "line2": "",
                    "street": "",
                    "city": "",
                    "postalCode": "",
                    "houseType": "",
                },
                "addressMode": "new",
            }
        else:
            profile = {**profile, "addressMode": "existing"}
        return {"widget": "ModifyAddressWidget", "data": profile}

    if step == "identity" and sub_step == "modify_address_choice":
        return None

    if step == "identity" and sub_step == "modify_employment":
        return {"widget": "ModifyEmploymentWidget", "data": session.get("customer_profile") or {}}

    if step == "identity" and sub_step == "modify_income":
        return {"widget": "ModifyIncomeWidget", "data": session.get("customer_profile") or {}}

    if step == "identity" and sub_step == "modify_income_proof_choice":
        return {"widget": "IncomeProofChoiceWidget", "data": {}}

    if step == "identity" and sub_step == "open_banking_email_sent":
        return {
            "widget": "DelayTriggerWidget",
            "data": {
                "auto_advance_ms": 10000,
                "next_message": "open_banking_linked",
                "silent": True,
            },
        }

    if step == "identity" and sub_step == "updating_details":
        updating = session.get("updating", {})
        return {
            "widget": "UpdatingWidget",
            "data": {
                "section": updating.get("section", "Details"),
                "auto_advance_ms": updating.get("auto_advance_ms", 3000),
                "next_message": updating.get("next_message", "update_complete"),
                "silent": updating.get("silent", True),
            },
        }

    if step == "identity" and sub_step == "expenses":
        _ensure_expenses_prefilled(session)
        expenses = session.get("expenses") or {}
        is_prefilled = bool(session.get("expenses_prefilled"))
        breakdown = expenses.get("breakdown")
        if not isinstance(breakdown, dict) or not breakdown:
            breakdown = session.get("expenses_breakdown") if isinstance(session.get("expenses_breakdown"), dict) else {}
        if not isinstance(breakdown, dict) or not breakdown:
            breakdown = EXPENSE_BREAKDOWN_DEFAULT if is_prefilled else {}
        mode = "edit" if session.get("expenses_editing") or not is_prefilled else "review"
        return {
            "widget": "ExpensesWidget",
            "data": {
                "mode": mode,
                "prefilled": is_prefilled,
                "modifyDisabled": not is_prefilled,
                "totalExpenses": expenses.get("total", session.get("expenses_total", 0 if not is_prefilled else 7560)),
                "breakdown": breakdown,
            },
        }

    if step == "identity" and sub_step == "expenses_saving":
        return {
            "widget": "LoadingWidget",
            "data": {
                "title": "Saving Monthly Expenses",
                "subtitle": "Please wait while we save your expense details.",
                "auto_advance_ms": 2000,
                "next_message": "expenses_saved",
                "silent": True,
            },
        }

    if step == "identity" and sub_step == "expenses_saved":
        return {
            "widget": "VerificationSuccessWidget",
            "data": {
                "title": "Expenses Saved Successfully",
                "subtitle": "Your monthly expenses have been saved successfully.",
                "auto_advance_ms": 2000,
                "next_message": "expenses_saved_complete",
                "silent": True,
            },
        }

    if step == "identity" and sub_step == "bureau_consent":
        _ensure_bureau_otp_sent(session, session.get("session_id", ""))
        session.pop("bureau_otp_error", None)
        return None

    if step == "identity" and sub_step == "bureau_otp_verifying":
        return {
            "widget": "LoadingWidget",
            "data": {
                "title": "Verifying Absher OTP",
                "subtitle": "Please wait while we verify your SIMAH consent.",
                "auto_advance_ms": 1000,
                "next_message": "bureau_otp_verified",
                "silent": True,
            },
        }

    if step == "identity" and sub_step == "bureau_success":
        return {
                "widget": "VerificationSuccessWidget",
            "data": {
                "title": "Consent Verified",
                "subtitle": "Thank you. Your consent has been successfully verified. We are now fetching your bureau records from SIMAH.",
                "auto_advance_ms": 3000,
                "next_message": "bureau_success_complete",
                "silent": True,
            },
        }

    if step == "identity" and sub_step == "eligibility_check":
        return {"widget": "LoadingWidget", "data": {"title": "Initiating eligibility check for you", "subtitle": "Running due diligence and regulatory checks", "auto_advance_ms": 3000, "next_message": "eligibility_check_complete", "silent": True}}

    if step == "offer" and sub_step == "pre_approved_offer":
        offer = session.setdefault("offer", {})
        offer["max_amount"] = PREAPPROVED_ETB_AMOUNT
        offer.setdefault("profit_rate", "6.1%")
        offer.setdefault("max_tenure", DEFAULT_OFFER_TENURE)
        return {
            "widget": "PreApprovedOfferWidget",
            "data": {
                "title": "Your Pre-Approved Offer",
                "max_amount": PREAPPROVED_ETB_AMOUNT,
                "profit_rate": offer.get("profit_rate", "6.1%"),
                "max_tenure": offer.get("max_tenure", DEFAULT_OFFER_TENURE),
                "is_preapproved_path": True,
                **tracker_data,
            },
        }

    if step == "offer" and sub_step == "eligible":
        offer = session.get("offer") or {}
        if not offer.get("max_amount"):
            computed_offer = _build_offer_from_eligibility(session)
            session["offer"] = {**offer, **computed_offer}
            offer = session["offer"]

        return {
            "widget": "EligibleOfferWidget",
            "data": {
                "title": "Eligible Finance Offer",
                "max_amount": offer.get("max_amount", 350000),
                "profit_rate": offer.get("profit_rate", "6.1%"),
                "max_tenure": offer.get("max_tenure", 60),
                "is_etb": customer_type == "ETB",
                "is_preapproved_path": False,
                **tracker_data,
            },
        }

    if step == "offer" and sub_step == "wants_more_decision":
        return {
            "widget": "WantsMoreDecisionWidget",
            "data": {
                "maxAmount": session.get("offer", {}).get("max_amount", 0),
            },
        }

    if step == "offer" and sub_step in {"wants_more_review", "wants_more_open_banking"}:
        return {
            "widget": "HigherAmountReviewWidget",
            "data": {},
        }

    if step == "offer" and sub_step == "wants_more_backoffice":
        return {
            "widget": "BackofficeWorkitemWidget",
            "data": {
                "workitem": session.get("backoffice_workitem", {}),
            },
        }

    if step == "disburse" and sub_step == "account":
        # A3: ETB gets pre-registered IBANs from IBAN Master (Excel)
        is_etb_account_holder = (
            customer_type == "ETB"
            or session.get("journeyOrigin") == "ETB"
            or journey_mode == "ETB_CORE"
        )
        if is_etb_account_holder:
            customer_id = session.get("collected", {}).get("id_number", "")
            registered_ibans = get_etb_registered_ibans(customer_id)
            
            return {
                "widget": "AccountSelectorWidget",
                "data": {
                    "accounts": registered_ibans,
                    "show_manual_entry": True,
                    "pre_select_default": True,  # Auto-select is_default=true account
                    "is_etb": True,
                    **tracker_data,
                },
            }
        if journey_mode == "NTB_ENRICHMENT" and session.get("ntb_open_banking_income_verified"):
            return {
                "widget": "AccountSelectorWidget",
                "data": {
                    "accounts": [
                        {
                            "type": "Existing Account",
                            "iban": "SA0230400197093922590013",
                            "bank": "Alawwal Bank",
                            "beneficiary": "Faisal Rahman",
                            "is_default": True,
                        },
                    ],
                    "show_manual_entry": True,
                    "pre_select_default": True,
                    "is_etb": False,
                    **tracker_data,
                },
            }

        # NTB: Empty list + manual entry
        return {
            "widget": "AccountSelectorWidget",
            "data": {
                "accounts": [],
                "show_manual_entry": True,
                "pre_select_default": False,
                "is_etb": False,
                **tracker_data,
            },
        }

    if step == "disburse" and sub_step == "iban_validation":
        from utils.eligibility import validate_iban
        iban = session.get("selected_account", {}).get("iban", "")
        validation_result = validate_iban(iban)
        return {
            "widget": "IBANValidationWidget",
            "data": {
                "iban": iban,
                "bank": validation_result.get("bank", "Unknown Bank"),
                "beneficiary": validation_result.get("beneficiary", ""),
                "valid": validation_result.get("valid", False),
                "reason": validation_result.get("reason", "Validation failed"),
            },
        }

    if step == "disburse" and sub_step == "application_summary":
        return {
            "widget": "ApplicationSummaryWidget",
            "data": _build_application_summary_data(session),
        }

    if step == "disburse" and sub_step == "ivr_consent":
        return {
            "widget": "FinalIVRConsentWidget",
            "data": {},
        }

    if step == "disburse" and sub_step == "otp_verifying":
        return {
            "widget": "LoadingWidget",
            "data": {
                "title": "Verifying OTP...",
                "subtitle": "Checking the 4-digit code you entered in chat.",
                "auto_advance_ms": 5000,
                "next_message": "otp_verification_complete",
                "silent": True,
            },
        }

    if step == "disburse" and sub_step == "ivr_requested":
        return {
            "widget": "LoadingWidget",
            "data": {
                "title": "IVR Request Started",
                "subtitle": "Please verify the details through the incoming call.",
                "auto_advance_ms": 10000,
                "next_message": "ivr_verification_complete",
                "silent": True,
            },
        }

    if step == "disburse" and sub_step in {"otp_success", "ivr_success"}:
        return {
            "widget": "VerificationSuccessWidget",
            "data": {
                "title": "OTP Verification Successful" if sub_step == "otp_success" else "IVR Verification Successful",
                "subtitle": "Your identity verification is complete. We are preparing the final disbursement screen.",
                "auto_advance_ms": 3000,
                "next_message": "complete_disbursement",
                "silent": True,
            },
        }

    if step == "offer" and sub_step == "slider":
        offer = session.get("offer", {})
        return {
            "widget": "OfferSliderWidget",
            "data": {
                "max_amount": offer.get("max_amount", 250000),
                "min_amount": 5000,
                "profit_rate": offer.get("profit_rate", "6.1%"),
                "default_tenure": offer.get("max_tenure", 60) if is_preapproved_path else 36,
                "default_amount": offer.get("max_amount", 250000) if is_preapproved_path else None,
                "is_preapproved_path": is_preapproved_path,
            },
        }

    if step == "offer" and sub_step == "summary":
        return {
            "widget": "FinanceSummaryWidget",
            "data": session.get("finance_summary") or {},
        }

    if step == "trade" and sub_step == "authorize":
        return {"widget": "CommodityTradeAuthorizationWidget", "data": {**tracker_data}}

    if step == "trade" and sub_step == "loading":
        return {"widget": "LoadingWidget", "data": {"title": "Executing Commodity Trade...", "subtitle": "Processing your Murabaha transaction", "auto_advance_ms": 3000, "next_message": "loading_complete", "silent": True}}

    if step == "trade" and sub_step == "success":
        return {"widget": "VerificationSuccessWidget", "data": {"title": "Commodity Trade Successful", "subtitle": "Your Murabaha transaction has been completed.", "auto_advance_ms": 3000, "next_message": "trade_certificate_ready", "silent": True}}

    if step == "trade" and sub_step == "certificate":
        certificate_url = _ensure_commodity_certificate_pdf(session)
        return {
            "widget": "DocumentPreviewWidget",
            "data": {
                "title": "Commodity Transaction Certificate",
                "subtitle": "Generated and ready to download",
                "current_step": 3,
                "documents": [{"name": "Commodity Transaction Certificate", "type": "pdf", "url": certificate_url}],
            },
        }

    if step == "trade" and sub_step == "contract_prompt":
        return {
            "widget": "GenerateContractWidget",
            "data": {}
        }

    if step == "esign" and sub_step == "documents":
        return {
            "widget": "DocumentPreviewWidget",
            "data": {
                "documents": [
                    {"name": "Contract Letter", "type": "pdf", "url": "/assets/ContractSaudi.pdf"},
                    {"name": "Promissory Note", "type": "pdf", "url": "/assets/PromissoryNote.pdf"},
                ],
                "title": "Contract & Promissory Note",
                "subtitle": "Ready for E-Sign",
                "current_step": 4,
                **tracker_data,
            },
        }

    if step == "esign" and sub_step == "email_sent":
        return {
            "widget": "LoadingWidget",
            "data": {
                "title": "E-Sign Email Sent",
                "subtitle": "Please complete the signature from your email. We will continue once it is verified.",
                "auto_advance_ms": 15000,
                "next_message": "esign_email_complete",
                "silent": True,
            },
        }

    if step == "esign" and sub_step == "otp_ivr":
        return {"widget": "OtpVerificationWidget", "data": {}}

    if step == "done":
        finance = session.get("finance_summary") or {}
        profile = _build_personal_widget_data(session, session.get("session_id"))
        selected_account = session.get("selected_account", {})
        customer_name = profile.get("name") or session.get("collected", {}).get("full_name") or "Customer"
        return {
            "widget": "DisbursementWidget",
            "data": session.get("disbursement", {
                "customer_name": customer_name,
                "reference": "PF-2025-XXXXXXXX",
                "date": time.strftime("%d %B %Y"),
                "amount": finance.get("amount", 0),
                "account": selected_account.get("iban", "Current Account ****1234"),
                "tenure": f"{finance.get('tenure', 0)} Months",
                "profit_rate": finance.get("profit_rate", ""),
                "first_installment": "03 July 2025",
                "monthly_installment": finance.get("monthly_installment", 0),
                "total_payable": finance.get("total_payable", 0),
                "bank": selected_account.get("bank", ""),
                "beneficiary": selected_account.get("beneficiary", ""),
            }),
        }

    return None


# ── SSE stream builder (AI SDK v6 UIMessageStream protocol) ─────────

def _persist_streamed_turn(
    session_id: str | None,
    user_text: str | None,
    response_text: str,
    widget_spec: dict | None,
    ui_flags: dict | None = None,
) -> None:
    if not session_id or not mongo_journey or not mongo_journey.is_available():
        return

    messages: list[dict[str, Any]] = []
    cleaned_user = (user_text or "").strip()
    if cleaned_user and not cleaned_user.startswith("__SYS__"):
        messages.append({"role": "user", "content": cleaned_user})

    cleaned_response = (response_text or "").strip()
    metadata: dict[str, Any] = {}
    if widget_spec:
        metadata["widget"] = widget_spec
    if ui_flags:
        metadata.update(ui_flags)

    if cleaned_response or metadata:
        messages.append(
            {
                "role": "assistant",
                "content": cleaned_response,
                **({"metadata": metadata} if metadata else {}),
                **({"widget": metadata["widget"]} if metadata.get("widget") else {}),
            }
        )

    if messages:
        mongo_journey.append_messages(session_id, messages)


def _build_sse_stream(response_text: str, widget_spec: dict | None, ui_flags: dict | None = None):
    """Generate SSE events in AI SDK v6 UIMessageStream protocol."""
    session_id = _STREAM_SESSION_ID.get()
    user_text = _STREAM_USER_TEXT.get()
    msg_id = f"msg_{int(time.time()*1000)}_{random.randint(1000,9999)}"
    text_part_id = f"text_{int(time.time()*1000)}_{random.randint(1000,9999)}"
    stream_flags = dict(ui_flags or {})
    stream_session = (SESSION_STORE.get(session_id) or _load_gateway_session(session_id)) if session_id else None
    customer_profile = stream_session.get("customer_profile") if isinstance(stream_session, dict) else None
    if isinstance(customer_profile, dict) and customer_profile:
        stream_flags.setdefault("customerProfile", customer_profile)

    def _event(data: str) -> str:
        return f"data: {data}\n\n"

    def _stream():
        _persist_streamed_turn(
            session_id,
            user_text,
            response_text,
            widget_spec,
            stream_flags,
        )

        yield _event(json.dumps({"type": "start", "messageId": msg_id}))
        yield _event(json.dumps({"type": "start-step"}))
        yield _event(json.dumps({"type": "text-start", "id": text_part_id}))

        # Stream text in ~20 char chunks
        chunks = re.findall(r".{1,20}", response_text) or [response_text]
        for chunk in chunks:
            yield _event(json.dumps({"type": "text-delta", "id": text_part_id, "delta": chunk}))

        yield _event(json.dumps({"type": "text-end", "id": text_part_id}))

        metadata: dict[str, Any] = {}
        if widget_spec:
            metadata["widget"] = widget_spec
        if stream_flags:
            metadata.update(stream_flags)
        if metadata:
            yield _event(json.dumps({"type": "message-metadata", "messageMetadata": metadata}))

        yield _event(json.dumps({"type": "finish-step"}))
        yield _event(json.dumps({"type": "finish"}))
        yield "data: [DONE]\n\n"

    return _stream()


def _stream_widget_response(response_text: str, widget_spec: dict | None, ui_flags: dict | None = None) -> StreamingResponse:
    return StreamingResponse(
        _build_sse_stream(response_text, widget_spec, ui_flags),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "x-vercel-ai-ui-message-stream": "v1",
        },
    )


def _is_expenses_confirmation_message(text: str) -> bool:
    normalized = _normalize_chat_text(text)
    if _looks_like_general_question(text):
        return False
    mentions_expenses = any(
        _contains_phrase(normalized, phrase)
        for phrase in ("expense", "expenses", "monthly expenses")
    )
    confirms = any(
        _contains_phrase(normalized, phrase)
        for phrase in (
            "confirm",
            "confirmed",
            "i confirm",
            "looks correct",
            "looks good",
            "correct",
            "approved",
            "proceed",
            "continue",
        )
    )
    return mentions_expenses and confirms


def _handle_active_widget_text_action(
    session: dict,
    session_id: str,
    raw_msg: str,
    normalized_msg: str,
) -> StreamingResponse | None:
    if not raw_msg or _looks_like_general_question(raw_msg):
        return None
    if raw_msg.lower().strip().startswith("__sys__"):
        return None

    step = session.get("step", "identity")
    sub_step = session.get("sub_step", "")

    def done(text: str, widget_spec_override: dict | None | object = ...) -> StreamingResponse:
        _store_gateway_session(session_id, session)
        widget_spec = resolve_widget(session, None) if widget_spec_override is ... else widget_spec_override
        return _stream_widget_response(text, widget_spec)

    if step == "identity" and sub_step == "identify_yourself":
        if _is_continuation_message(raw_msg):
            session["sub_step"] = "personal_details"
            return done(
                "I have retrieved your current profile details. Please review them to make sure everything is correct to proceed."
            )
        if _is_decline_message(raw_msg):
            return done("No problem. Take your time and let me know when you're ready to begin.", None)

    if step == "identity" and sub_step == "expenses":
        if _is_expenses_confirmation_message(raw_msg) or normalized_msg == "expenses_confirm":
            _start_expenses_saving(session)
            return done("Saving your monthly expenses. Please wait while we save your expense details.")
        if any(_contains_phrase(normalized_msg, phrase) for phrase in ("modify expenses", "edit expenses", "change expenses")):
            session["expenses_editing"] = True
            session.setdefault("expenses", {})
            return done("Edit the category amounts below, then save your changes.")

    if step == "offer" and sub_step == "eligible":
        if _looks_like_offer_continue_message(raw_msg):
            session["sub_step"] = "wants_more_decision"
            return done("Please confirm whether the maximum eligible amount is okay for you.")

    if step == "offer" and sub_step in {"wants_more_review", "wants_more_open_banking"}:
        if any(_contains_phrase(normalized_msg, phrase) for phrase in ("go back", "back", "cancel review")):
            session["sub_step"] = "wants_more_decision"
            return done("Please confirm whether the maximum eligible amount is okay for you.")
        if (
            normalized_msg == "submit_higher_amount_review"
            or (_contains_phrase(normalized_msg, "submit") and _contains_phrase(normalized_msg, "review"))
            or _contains_phrase(normalized_msg, "send for review")
        ):
            session["sub_step"] = "wants_more_backoffice"
            _ensure_higher_amount_workitem(session)
            return done("Your request has been submitted for manual review.")

    return None


def _parse_rate(rate_text: Any) -> float:
    match = re.search(r"(\d+(?:\.\d+)?)", str(rate_text or "6.1"))
    return float(match.group(1)) if match else 6.1


def _build_finance_summary(amount: int, tenure: int, profit_rate_text: Any = None) -> dict:
    annual_rate = _parse_rate(profit_rate_text)
    monthly_rate = annual_rate / 100 / 12
    if monthly_rate > 0 and tenure > 0:
        installment = amount * monthly_rate * ((1 + monthly_rate) ** tenure) / (((1 + monthly_rate) ** tenure) - 1)
    else:
        installment = amount / max(tenure, 1)
    monthly_installment = int(round(installment))
    return {
        "amount": int(amount),
        "tenure": int(tenure),
        "profit_rate": f"{annual_rate:g}%",
        "monthly_installment": monthly_installment,
        "total_payable": monthly_installment * int(tenure),
    }


def _complete_eligibility_check(session: dict) -> None:
    current_offer = session.get("offer") or {}
    computed_offer = _build_offer_from_eligibility(session)
    session["offer"] = {
        **current_offer,
        **computed_offer,
    }
    session["step"] = "offer"
    session["step_number"] = 2
    session["sub_step"] = "eligible"


def _populate_selected_account_details(session: dict) -> None:
    account = session.setdefault("selected_account", {})
    iban = account.get("iban", "")
    if not iban:
        return
    if account.get("bank") and account.get("beneficiary"):
        return
    try:
        from utils.eligibility import validate_iban
        iban_lookup = validate_iban(iban)
        if iban_lookup.get("valid"):
            account["bank"] = account.get("bank") or iban_lookup.get("bank", "")
            account["beneficiary"] = account.get("beneficiary") or iban_lookup.get("beneficiary", "")
    except Exception:
        logger.exception("Failed to derive bank details for IBAN %s", iban)


def _send_docusign_for_session(session: dict, session_id: str) -> None:
    if session.get("docusign_email_sent"):
        return
    profile = _build_personal_widget_data(session, session_id) or session.get("customer_profile") or {}
    if profile and not session.get("customer_profile"):
        session["customer_profile"] = profile
    email = profile.get("email")
    name = profile.get("name") or session.get("collected", {}).get("full_name") or "Customer"
    if not email:
        logger.warning("[routing] session=%s skipped docusign email because customer_profile.email is missing", session_id)
        return
    try:
        if send_docusign_email(email, name):
            session["docusign_email_sent"] = True
    except Exception as exc:
        logger.error("Failed to trigger Docusign email for session %s: %s", session_id, exc)


def _finish_disbursement(session: dict) -> None:
    finance_summary = session.get("finance_summary", {})
    selected_account = session.get("selected_account", {})
    session["disbursement"] = {
        "customer_name": (_build_personal_widget_data(session, session.get("session_id", "")) or {}).get("name", "Customer"),
        "reference": f"PF-2025-{str(abs(hash(session.get('collected', {}).get('id_number', ''))))[:8]}",
        "date": datetime.datetime.now().strftime("%d %B %Y"),
        "amount": finance_summary.get("amount", 0),
        "account": selected_account.get("iban", "****1234"),
        "tenure": f"{finance_summary.get('tenure', 0)} Months",
        "profit_rate": finance_summary.get("profit_rate", ""),
        "first_installment": (datetime.datetime.now() + datetime.timedelta(days=90)).strftime("%d %B %Y"),
        "monthly_installment": finance_summary.get("monthly_installment", 0),
        "total_payable": finance_summary.get("total_payable", 0),
        "bank": selected_account.get("bank", ""),
        "beneficiary": selected_account.get("beneficiary", ""),
    }
    session["step"] = "done"
    session["sub_step"] = "complete"


def _is_widget_event(raw_msg: str, normalized_msg: str) -> bool:
    raw = (raw_msg or "").strip()
    lower = raw.lower()
    if lower.startswith("__sys__"):
        return True
    if lower.startswith(("account_selected::", "iban_entered::", "document_uploaded:")):
        return True
    return normalized_msg in {
        "nafath approved",
        "confirm and proceed",
        "let me enter a different iban",
        "send me an otp",
        "call me for ivr verification",
        "i do not consent",
        "otp verification",
        "ivr verification",
        "go with offer",
        "accepted_pre_approved_offer",
        "i need higher amount",
        "need higher amount",
        "higher_amount_requested",
        "request for a higher amount",
        "continue with current eligible amount",
    }


def _handle_widget_event(session: dict, session_id: str, raw_msg: str, normalized_msg: str) -> StreamingResponse | None:
    if not _is_widget_event(raw_msg, normalized_msg):
        return None

    raw = (raw_msg or "").strip()
    raw_lower = raw.lower()
    signal = normalized_msg
    step = session.get("step", "identity")
    sub_step = session.get("sub_step", "")
    response_text = "Please continue."
    ui_flags: dict[str, Any] = {}

    def done(text: str, widget_spec_override: dict | None | object = ...) -> StreamingResponse:
        _store_gateway_session(session_id, session)
        widget_spec = resolve_widget(session, None) if widget_spec_override is ... else widget_spec_override
        return _stream_widget_response(text, widget_spec, ui_flags)

    profile_completion_payload = _extract_prefixed_json_payload(raw_msg, "PROFILE_COMPLETION")
    if profile_completion_payload is not None:
        session["step"] = "identity"
        session["sub_step"] = "personal_details"
        field = profile_completion_payload.get("field")
        value = profile_completion_payload.get("value")
        if field and value is not None:
            _apply_personal_completion_value(session, str(field), str(value))
        completion_state = _get_personal_completion_state(session)
        if completion_state:
            session["profile_completion"] = completion_state
            session["profile_completion_stage"] = PERSONAL_COMPLETION_STAGE_COLLECTING
            current_field = completion_state["current_field"]
            ui_flags.update({
                "options": _build_personal_completion_options(current_field),
                "optionContext": {
                    "type": "profile_completion",
                    "field": current_field,
                },
            })
            return done(_build_personal_completion_prompt(current_field), None)
        session.pop("profile_completion", None)
        session.pop("profile_completion_stage", None)
        return done(
            "Your profile details are complete. Please review them and choose Modify Details or Confirm & Continue."
        )

    if step == "identity":
        if sub_step == "nafath_pending" and signal == "nafath approved":
            session["sub_step"] = "loading"
            return done("Your identity is being verified now. Please wait while we complete this step.")

        if sub_step == "loading" and signal == "loading_complete":
            session["sub_step"] = "verified"
            return done("Your identity has been verified successfully. We are moving to the Dedupe check now.")

        if sub_step == "verified" and signal == "continue":
            session["sub_step"] = "dedupe_check"
            return done("We are running a Dedupe check to verify your records. Please wait a moment while we continue.")

        if sub_step == "dedupe_check" and signal in {"dedupe_complete", "loading_complete"}:
            if session.get("customerType") == "ETB":
                session["step"] = "offer"
                session["step_number"] = 2
                session["sub_step"] = "pre_approved_offer"
                session["journeyMode"] = "ETB_CORE"
                response_text = "Welcome back **Abdul Rahman!** You're eligible for a **Pre-approved Cash Finance offer.** Please review the details below"
            else:
                session["sub_step"] = "identify_yourself"
                session["journeyMode"] = "NTB_ENRICHMENT"
                response_text = "**Welcome aboard!** Here's a quick overview of the journey ahead and the steps you'll complete to secure your finance."
            return done(response_text)

        if sub_step == "identify_yourself" and signal == "continue":
            session["sub_step"] = "personal_details"
            return done("I have retrieved your current profile details. Please review them to make sure everything is correct to proceed.")

        if sub_step == "personal_details" and signal == "continue":
            personal_completion_state = _get_personal_completion_state(session)
            if personal_completion_state:
                session["profile_completion"] = personal_completion_state
                session.setdefault("profile_completion_stage", PERSONAL_COMPLETION_STAGE_AWAITING_PROCEED)
                return done("Please complete the missing details in chat to continue.")
            session["sub_step"] = "expenses"
            return done("Let's proceed to your monthly expenses review.")

        if signal == "bureau_consent_granted":
            session["sub_step"] = "bureau_consent"
            session.pop("profile_completion", None)
            session.pop("profile_completion_stage", None)
            _ensure_bureau_otp_sent(session, session_id)
            return done(BUREAU_CONSENT_OTP_PROMPT)

        if signal == "bureau_otp_verified":
            session["sub_step"] = "bureau_success"
            return done("Thank you. Your consent has been successfully verified. We are now fetching your bureau records from SIMAH.")

        if signal == "bureau_success_complete":
            session["sub_step"] = "eligibility_check"
            return done("Initiating eligibility check. Running due-diligence and regulatory checks.")

        if signal == "bureau_consent_denied":
            session["sub_step"] = "bureau_consent"
            return done("No problem. Please review the consent when you're ready to continue.")

        if signal == "eligibility_check_complete":
            _complete_eligibility_check(session)
            session.pop("profile_completion", None)
            session.pop("profile_completion_stage", None)
            return done("Your eligibility check is complete. Please review the offer below.")

    if step == "offer":
        if sub_step == "pre_approved_offer":
            if signal in {"accepted_pre_approved_offer", "go with offer"}:
                session["step"] = "identity"
                session["sub_step"] = "bureau_consent"
                _ensure_bureau_otp_sent(session, session.get("session_id", ""))
                return done(BUREAU_CONSENT_OTP_PROMPT)
            if signal in {"higher_amount_requested", "need higher amount", "i need higher amount", "request for a higher amount"}:
                session["wants_more"] = True
                session["journeyMode"] = "NTB_ENRICHMENT"
                session["journeyOrigin"] = session.get("customerType", "UNKNOWN")
                session["transitionReason"] = "Customer requested higher amount than pre-approved ETB offer"
                session["step"] = "identity"
                session["sub_step"] = "identify_yourself"
                return done("**Welcome aboard!** Here's a quick overview of the journey ahead and the steps you'll complete to secure your finance.")

        if sub_step == "eligible" and signal == "continue":
            session["sub_step"] = "wants_more_decision"
            return done("Please confirm whether the maximum eligible amount is okay for you.")

        if sub_step == "wants_more_decision":
            if signal == "accepted_max_offer":
                session["sub_step"] = "slider"
                return done("Please choose your desired finance amount and tenure.")
            if signal == "higher_amount_requested":
                session["sub_step"] = "wants_more_review"
                return done("Please review the manual review request details below.")

        if sub_step in {"wants_more_review", "wants_more_open_banking"} and signal == "higher_amount_review_go_back":
            session["sub_step"] = "wants_more_decision"
            return done("Please confirm whether the maximum eligible amount is okay for you.")

        if sub_step in {"wants_more_review", "wants_more_open_banking"} and signal == "submit_higher_amount_review":
            session["sub_step"] = "wants_more_backoffice"
            _ensure_higher_amount_workitem(session)
            return done("Your request has been submitted for manual review.")

        payload = _extract_prefixed_json_payload(raw_msg, "CONFIRM_FINANCE_PLAN")
        if sub_step == "slider" and payload is not None:
            amount = int(payload.get("amount") or payload.get("loan_amount") or session.get("offer", {}).get("max_amount", 0))
            tenure = int(payload.get("tenure") or payload.get("tenure_months") or 36)
            rate = payload.get("profitRate") or session.get("offer", {}).get("profit_rate", "6.1%")
            session["finance_summary"] = _build_finance_summary(amount, tenure, rate)
            session["finance_amount"] = amount
            session["sub_step"] = "summary"
            return done("Your finance summary is ready. Please review the details below.")

        if sub_step == "summary" and signal == "continue":
            session["step"] = "trade"
            session["step_number"] = 3
            session["sub_step"] = "authorize"
            return done(
                "To finalize your finance, I will now initiate the commodity trade on your behalf. This step ensures your application remains fully Shariah-compliant. Do you authorize me to execute this trade for you?"
            )

    if step == "trade":
        if sub_step == "authorize" and signal == "continue":
            session["sub_step"] = "loading"
            return done("We are executing the commodity trade now.")

        if sub_step == "loading" and signal == "loading_complete":
            session["sub_step"] = "success"
            return done("Commodity trade completed successfully.")

        if sub_step == "success" and signal == "trade_certificate_ready":
            session["sub_step"] = "certificate"
            return done("Your Commodity Transaction Certificate has been generated.")

        if sub_step == "certificate" and signal == "proceed_contract_prompt":
            session["sub_step"] = "contract_prompt"
            return done("To finalise your Cash Finance agreement, you are required to review and  sign the following documents.")

        if sub_step == "contract_prompt" and signal == "proceed_esign":
            session["step"] = "esign"
            session["step_number"] = 4
            session["sub_step"] = "documents"
            return done("Please review the Contract & Promissory Note below. When ready, proceed with e-signing.")

    if step == "esign":
        if sub_step == "documents" and signal == "proceed_esign":
            try:
                _send_docusign_for_session(session, session_id)
            except Exception as e:
                logger.error("Exception in _send_docusign_for_session (continuing anyway): %s", e)
            session["sub_step"] = "email_sent"
            return done(
                "Please complete the signature from your email. We will continue once it is verified."
            )

        if sub_step == "email_sent" and signal == "esign_email_complete":
            session["step"] = "disburse"
            session["step_number"] = 5
            session["sub_step"] = "account"
            return done("**Congratulations!** \n\n Your documents have been successfully signed and verified.\n\n Next, please select the account that should be credited with the approved funds.")

    if step == "disburse":
        if sub_step == "account":
            if raw_lower.startswith("account_selected::"):
                iban = raw.split("::", 1)[1].strip()
                session["selected_account"] = {"iban": iban}
                for account in (resolve_widget(session, None) or {}).get("data", {}).get("accounts", []):
                    if account.get("iban") == iban:
                        session["selected_account"].update({
                            "bank": account.get("bank", ""),
                            "beneficiary": account.get("beneficiary", ""),
                        })
                        break
                session["sub_step"] = "iban_validation"
                return done("We are validating the selected IBAN now.")
            if raw_lower.startswith("iban_entered::"):
                session["selected_account"] = {"iban": raw.split("::", 1)[1].strip().replace(" ", "")}
                session["sub_step"] = "iban_validation"
                return done("We are validating the entered IBAN now.")

        if sub_step == "iban_validation":
            if signal == "let me enter a different iban":
                session["sub_step"] = "account"
                return done("Please enter a different IBAN for disbursement.")
            if signal == "confirm and proceed":
                _populate_selected_account_details(session)
                session["sub_step"] = "application_summary"
                return done("Please review your application summary before final verification.")

        if sub_step == "application_summary" and signal == "continue":
            session["sub_step"] = "ivr_consent"
            return done("Please choose your final verification method.")

        if sub_step == "ivr_consent":
            if signal in {"send me an otp", "otp verification"}:
                _ensure_disbursement_otp_sent(session, session_id)
                if not session.get("disbursement_otp_sent"):
                    session["sub_step"] = "ivr_consent"
                    send_error = session.get("disbursement_otp_error") or "Unable to send OTP. Please try again."
                    return done(f"{send_error} Please choose OTP verification again or continue with IVR verification.")
                session["sub_step"] = "otp_entry"
                session.pop("disbursement_otp_error", None)
                return done(FINAL_DISBURSEMENT_OTP_PROMPT)
            if signal in {"call me for ivr verification", "ivr verification"}:
                session["sub_step"] = "ivr_requested"
                return done("IVR request is started. Please verify the details through the call.")
            if signal == "i do not consent":
                session["step"] = "offer"
                session["sub_step"] = "wants_more_backoffice"
                session["backoffice_workitem"] = {
                    "customerId": session.get("collected", {}).get("id_number", ""),
                    "remarks": "Customer did not consent to final verification. Route to RM review.",
                }
                return done("We have routed your application for back-office review.")

        if sub_step == "otp_verifying" and signal == "otp_verification_complete":
            session["sub_step"] = "otp_success"
            return done("OTP verification completed successfully.")

        if sub_step == "ivr_requested" and signal == "ivr_verification_complete":
            session["sub_step"] = "ivr_success"
            return done("IVR verification completed successfully.")

        if sub_step in {"otp_success", "ivr_success"} and signal == "complete_disbursement":
            _finish_disbursement(session)
            return done("Final verification is complete. Your disbursement summary is ready.")

    return None


# ── Request models ───────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str
    messages: List[Dict[str, Any]]
    session: Dict[str, Any] | None = None

class UpdateCustomerRequest(BaseModel):
    session_id: str
    national_id: str
    updated_data: Dict[str, Any]

class OpenBankingEmailRequest(BaseModel):
    session_id: str
    email: str
    name: str

class SendOpenBankingEmailRequest(BaseModel):
    session_id: str
    email: str
    name: str

class DocusignEmailRequest(BaseModel):
    session_id: str
    email: str
    name: str


# ── Endpoints ────────────────────────────────────────────────────────

@router.post("/chat")
async def chat(request: ChatRequest):
    session_id = request.session_id
    last_user_msg = (request.messages[-1].get("content", "") if request.messages else "").strip()
    normalized_user_msg = _normalize_chat_text(last_user_msg)
    _STREAM_SESSION_ID.set(session_id)
    _STREAM_USER_TEXT.set(last_user_msg)

    # Get or create session
    current_session = SESSION_STORE.get(session_id)
    if not current_session:
        persisted_session = _load_gateway_session(session_id)
        if persisted_session:
            current_session = persisted_session
            current_session["session_id"] = session_id
        elif isinstance(request.session, dict) and request.session:
            current_session = dict(request.session)
            current_session["session_id"] = session_id
            current_session.setdefault("region", "SA")
            current_session.setdefault("step", "identity")
            current_session.setdefault("sub_step", "awaiting_id")
            current_session.setdefault("step_number", 1)
            current_session.setdefault("total_steps", 5)
            current_session.setdefault("product", "cash_finance")
            current_session.setdefault("user_type", "unknown")
            current_session.setdefault("customerType", "UNKNOWN")
            current_session.setdefault("journeyMode", "PRE_DEDUPE")
            current_session.setdefault("journeyOrigin", "UNKNOWN")
            current_session.setdefault("transitionReason", None)
            current_session.setdefault("collected", {})
            current_session.setdefault("offer", {})
            current_session.setdefault("finance_summary", {})
            current_session.setdefault("disbursement", {})
            current_session.setdefault("_lastWidgetState", "identity/awaiting_id")
        else:
            current_session = _default_gateway_session(session_id)
        _store_gateway_session(session_id, current_session)

    if _is_completed_journey_session(current_session):
        _delete_gateway_journey(session_id)
        current_session = _default_gateway_session(session_id)
        _store_gateway_session(session_id, current_session)
    else:
        current_session["session_id"] = session_id

    if _hydrate_customer_profile_if_available(current_session, session_id):
        _store_gateway_session(session_id, current_session)

    widget_event_response = _handle_widget_event(current_session, session_id, last_user_msg, normalized_user_msg)
    if widget_event_response is not None:
        return widget_event_response

    active_widget_text_response = _handle_active_widget_text_action(
        current_session,
        session_id,
        last_user_msg,
        normalized_user_msg,
    )
    if active_widget_text_response is not None:
        return active_widget_text_response

    # Compatibility quick-path for legacy e-sign OTP state.
    # Unified to a 4-digit code so voice and text behavior stay consistent end-to-end.
    esign_otp = _extract_otp_from_message(last_user_msg, expected_len=4)
    if esign_otp:
        sub = current_session.get("sub_step", "")
        if current_session.get("step") == "esign" and sub == "otp_ivr":
            current_session["step"] = "disburse"
            current_session["sub_step"] = "account"
            _store_gateway_session(session_id, current_session)

            widget_spec = resolve_widget(current_session, None)
            response_text = "OTP verification successful. Proceeding to disbursement account selection."
            return _stream_widget_response(response_text, widget_spec)

    bureau_otp_payload = _extract_prefixed_json_payload(last_user_msg, "BUREAU_OTP_VERIFY")
    if bureau_otp_payload is not None and current_session.get("step") == "identity":
        otp = _extract_otp_from_message(str(bureau_otp_payload.get("otp", "")).strip(), expected_len=4) or ""
        if current_session.get("sub_step") == "bureau_consent" and _verify_bureau_otp(current_session, session_id, otp):
            current_session["sub_step"] = "bureau_otp_verifying"
            current_session.pop("bureau_otp_error", None)
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = "We are verifying your Absher OTP now."
            return _stream_widget_response(response_text, widget_spec)

        current_session["sub_step"] = "bureau_consent"
        current_session["bureau_otp_error"] = OTP_RETRY_PROMPT
        _store_gateway_session(session_id, current_session)
        widget_spec = resolve_widget(current_session, None)
        response_text = f"{OTP_RETRY_PROMPT} {BUREAU_CONSENT_OTP_PROMPT}"
        return _stream_widget_response(response_text, widget_spec)

    extracted_otp = _extract_otp_from_message(last_user_msg, expected_len=4)
    sub = current_session.get("sub_step", "")

    if current_session.get("step") == "disburse" and sub == "otp_entry":
        if extracted_otp:
            if _verify_disbursement_otp(current_session, session_id, extracted_otp):
                current_session["sub_step"] = "otp_verifying"
                current_session.pop("disbursement_otp_error", None)
                _store_gateway_session(session_id, current_session)
                widget_spec = resolve_widget(current_session, None)
                response_text = "We are verifying the OTP now."
                return _stream_widget_response(response_text, widget_spec)

            current_session["disbursement_otp_error"] = OTP_RETRY_PROMPT
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = f"{OTP_RETRY_PROMPT} {FINAL_DISBURSEMENT_OTP_PROMPT}"
            return _stream_widget_response(response_text, widget_spec)

        if last_user_msg and not _looks_like_general_question(last_user_msg, current_session):
            widget_spec = resolve_widget(current_session, None)
            response_text = (
                "I could not capture a valid 4-digit OTP. "
                "Please say or enter only the four digits clearly, for example: one nine nine five. "
                f"{FINAL_DISBURSEMENT_OTP_PROMPT}"
            )
            return _stream_widget_response(response_text, widget_spec)

    if current_session.get("step") == "identity" and sub == "bureau_consent":
        if extracted_otp:
            if _verify_bureau_otp(current_session, session_id, extracted_otp):
                current_session["sub_step"] = "bureau_otp_verifying"
                current_session.pop("bureau_otp_error", None)
                _store_gateway_session(session_id, current_session)
                widget_spec = resolve_widget(current_session, None)
                response_text = "We are verifying your Absher OTP now."
                return _stream_widget_response(response_text, widget_spec)

            current_session["bureau_otp_error"] = OTP_RETRY_PROMPT
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = f"{OTP_RETRY_PROMPT} {BUREAU_CONSENT_OTP_PROMPT}"
            return _stream_widget_response(response_text, widget_spec)

        if _looks_like_otp_attempt(last_user_msg) and not _looks_like_general_question(last_user_msg, current_session):
            widget_spec = resolve_widget(current_session, None)
            response_text = (
                "I could not capture a valid 4-digit Absher OTP. "
                "Please say or enter only the four digits clearly, for example: one nine nine five. "
                f"{BUREAU_CONSENT_OTP_PROMPT}"
            )
            return _stream_widget_response(response_text, widget_spec)

    # Quick-path: internal widget signals should not fall through to the LLM layer.
    # This keeps button clicks deterministic even if the session is momentarily behind
    # the widget that emitted the signal.
    direct_signal = normalized_user_msg
    if current_session.get("step") == "identity" and direct_signal in {
        "bureau_consent_granted",
        "bureau_consent_denied",
        "bureau_otp_verified",
        "bureau_success_complete",
        "expenses_saved",
        "expenses_saved_complete",
        "eligibility_check_complete",
    }:
        current_sub = current_session.get("sub_step", "")
        if direct_signal == "expenses_saved" and current_sub == "expenses_saving":
            current_session["sub_step"] = "expenses_saved"
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = "Your monthly expenses have been saved successfully."
            return StreamingResponse(
                _build_sse_stream(response_text, widget_spec),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
            )

        if direct_signal == "expenses_saved_complete" and current_sub == "expenses_saved":
            current_session["sub_step"] = "bureau_consent"
            _ensure_bureau_otp_sent(current_session, session_id)
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = BUREAU_CONSENT_OTP_PROMPT
            return StreamingResponse(
                _build_sse_stream(response_text, widget_spec),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
            )

        if direct_signal == "eligibility_check_complete" and current_sub in {
            "personal_details",
            "bureau_consent",
            "bureau_otp_verifying",
            "bureau_success",
            "eligibility_check",
        }:
            offer = current_session.get("offer", {}) or {}
            customer_type = current_session.get("customerType") or "UNKNOWN"
            journey_mode = current_session.get("journeyMode") or (
                "ETB_CORE" if customer_type == "ETB" else "NTB_ENRICHMENT"
            )
            current_session["offer"] = {
                **offer,
                **_build_offer_from_eligibility(current_session),
            }
            current_session["step"] = "offer"
            current_session["step_number"] = 2
            current_session["sub_step"] = "eligible"
            current_session["journeyMode"] = journey_mode
            current_session.pop("profile_completion", None)
            current_session.pop("profile_completion_stage", None)
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = "Your eligibility check is complete. Please review the offer below."
            return StreamingResponse(
                _build_sse_stream(response_text, widget_spec),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
            )

        if direct_signal == "bureau_otp_verified" and current_sub == "bureau_otp_verifying":
            current_session["sub_step"] = "bureau_success"
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = "Thank you. Your consent has been successfully verified. We are now fetching your bureau records from SIMAH."
            return StreamingResponse(
                _build_sse_stream(response_text, widget_spec),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
            )

        if direct_signal == "bureau_success_complete" and current_sub == "bureau_success":
            current_session["sub_step"] = "eligibility_check"
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = "Initiating eligibility check. Running due-diligence and regulatory checks."
            return StreamingResponse(
                _build_sse_stream(response_text, widget_spec),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
            )

        if current_sub in {"personal_details", "bureau_consent"}:
            if direct_signal == "bureau_consent_granted":
                current_session["sub_step"] = "bureau_consent"
                current_session.pop("profile_completion", None)
                current_session.pop("profile_completion_stage", None)
                _ensure_bureau_otp_sent(current_session, session_id)
                _store_gateway_session(session_id, current_session)
                widget_spec = resolve_widget(current_session, None)
                response_text = BUREAU_CONSENT_OTP_PROMPT
                return StreamingResponse(
                    _build_sse_stream(response_text, widget_spec),
                    media_type="text/event-stream",
                    headers={
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                        "x-vercel-ai-ui-message-stream": "v1",
                    },
                )

            current_session["sub_step"] = "bureau_consent"
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = "No problem. Please review the consent when you're ready to continue."
            return StreamingResponse(
                _build_sse_stream(response_text, widget_spec),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
            )

    # Identity routing for widget-triggered intents.
    if current_session.get("step") == "identity":
        if current_session.get("sub_step") == "updating_details" and normalized_user_msg == "update_complete":
            updating_section = (current_session.get("updating") or {}).get("section")
            profile_section = UPDATE_SECTION_PROFILE_KEYS.get(updating_section)
            if profile_section:
                _finalize_pending_profile_update(current_session, profile_section)
                _ensure_session_customer_profile(current_session)
            current_session["sub_step"] = "personal_details"
            current_session.pop("updating", None)
            current_session.pop("pending_income_verification", None)
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = (
                "Your details have been successfully updated. "
                "Would you like to update any other details, or should we confirm and proceed?"
            )
            return StreamingResponse(
                _build_sse_stream(response_text, widget_spec),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
                )

        if current_session.get("sub_step") == "modify_address_choice":
            existing_phrases = {
                "existing",
                "modify existing",
                "existing address",
                "old address",
                "update existing address",
                "keep existing address",
            }
            new_phrases = {
                "new",
                "new address",
                "add new address",
                "add address",
                "add a new address",
                "create new address",
            }
            if any(_contains_phrase(normalized_user_msg, phrase) for phrase in existing_phrases):
                current_session["sub_step"] = "modify_address"
                current_session["modify_address_mode"] = "existing"
                _store_gateway_session(session_id, current_session)
                widget_spec = resolve_widget(current_session, None)
                response_text = "Please update your address details below."
                return StreamingResponse(
                    _build_sse_stream(response_text, widget_spec),
                    media_type="text/event-stream",
                    headers={
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                        "x-vercel-ai-ui-message-stream": "v1",
                    },
                )
            if any(_contains_phrase(normalized_user_msg, phrase) for phrase in new_phrases):
                current_session["sub_step"] = "modify_address"
                current_session["modify_address_mode"] = "new"
                _store_gateway_session(session_id, current_session)
                widget_spec = resolve_widget(current_session, None)
                response_text = "Please add the new address details below."
                return StreamingResponse(
                    _build_sse_stream(response_text, widget_spec),
                    media_type="text/event-stream",
                    headers={
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                        "x-vercel-ai-ui-message-stream": "v1",
                    },
                )

        if current_session.get("sub_step") == "modify_employment_document_pending" and normalized_user_msg.startswith("document_uploaded:"):
            _finalize_pending_profile_update(current_session, "employment")
            current_session["sub_step"] = "updating_details"
            current_session["updating"] = {
                "section": "Employment Details",
                "auto_advance_ms": 3000,
                "next_message": "update_complete",
                "silent": True,
            }
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = "We are updating your employment details now. Please wait while we save the changes."
            return StreamingResponse(
                _build_sse_stream(response_text, widget_spec),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
            )

        if current_session.get("sub_step") == "modify_income_upload_statement":
            income_amount = _extract_income_amount(last_user_msg)
            if income_amount is not None:
                _apply_pending_income_amount(current_session, income_amount)
                current_session["pending_income_verification"] = "upload_statement"
                _store_gateway_session(session_id, current_session)
                response_text = f"Updated your monthly income to SAR {income_amount}. Please upload your bank statement below."
                return StreamingResponse(
                    _build_sse_stream(response_text, None, {"allow_upload": True}),
                    media_type="text/event-stream",
                    headers={
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                        "x-vercel-ai-ui-message-stream": "v1",
                    },
                )

        if current_session.get("sub_step") == "modify_income_upload_statement" and normalized_user_msg.startswith("document_uploaded:"):
            _finalize_pending_profile_update(current_session, "income")
            current_session["sub_step"] = "updating_details"
            current_session["updating"] = {
                "section": "Income Details",
                "auto_advance_ms": 3000,
                "next_message": "update_complete",
                "silent": True,
            }
            current_session["pending_income_verification"] = "upload_statement"
            current_session["income_verification_method"] = "upload_statement"
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = "We are updating your income details now. Please wait while we save the changes."
            return StreamingResponse(
                _build_sse_stream(response_text, widget_spec),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
            )

        if current_session.get("sub_step") == "open_banking_email_sent" and normalized_user_msg == "open_banking_linked":
            current_session["sub_step"] = "updating_details"
            current_session["updating"] = {
                "section": "Income Details",
                "auto_advance_ms": 11000,
                "next_message": "open_banking_update_complete",
                "silent": True,
            }
            current_session["pending_income_verification"] = "open_banking"
            current_session["income_verification_method"] = "open_banking"
            current_session["ntb_open_banking_income_verified"] = True
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = "We are updating your income details now. Please wait while we save the changes."
            return StreamingResponse(
                _build_sse_stream(response_text, widget_spec),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
            )

        if current_session.get("sub_step") == "updating_details" and normalized_user_msg == "open_banking_update_complete":
            _finalize_pending_profile_update(current_session, "income")
            _prefill_open_banking_expenses(current_session)
            current_session["sub_step"] = "personal_details"
            current_session.pop("updating", None)
            current_session.pop("pending_income_verification", None)
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = (
                "Your details have been successfully updated. "
                "Would you like to update any other details, or should we confirm and proceed?"
            )
            return StreamingResponse(
                _build_sse_stream(response_text, widget_spec),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
            )

        if normalized_user_msg == "expenses_modify":
            current_session["sub_step"] = "expenses"
            current_session["expenses_editing"] = True
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = "Edit the category amounts below, then save your changes."
            return StreamingResponse(
                _build_sse_stream(response_text, widget_spec),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
            )

        if normalized_user_msg == "expenses_confirm":
            _start_expenses_saving(current_session)
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = "Saving your monthly expenses. Please wait while we save your expense details."
            return StreamingResponse(
                _build_sse_stream(response_text, widget_spec),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
            )

        explicit_identity_routes = {
            "modify_section": "modify_section",
            "modify_personal": "modify_personal",
            "modify_address": "modify_address_choice",
            "modify_address_existing": "modify_address",
            "modify_address_new": "modify_address",
            "modify_employment": "modify_employment",
            "modify_income": "modify_income",
            "upload_statement": "modify_income_upload_statement",
            "open_banking": "open_banking_email_sent",
        }
        target_sub_step = explicit_identity_routes.get(normalized_user_msg)
        if target_sub_step:
            current_session["sub_step"] = target_sub_step
            if normalized_user_msg == "modify_address":
                current_session.pop("modify_address_mode", None)
            elif normalized_user_msg == "modify_address_existing":
                current_session["modify_address_mode"] = "existing"
            elif normalized_user_msg == "modify_address_new":
                current_session["modify_address_mode"] = "new"
            elif normalized_user_msg == "upload_statement":
                current_session["pending_income_verification"] = "upload_statement"
            elif normalized_user_msg == "open_banking":
                current_session["pending_income_verification"] = "open_banking"
                current_session["income_verification_method"] = "open_banking"
                current_session["ntb_open_banking_income_verified"] = True
                profile = _build_personal_widget_data(current_session, session_id) or {}
                if profile and not current_session.get("customer_profile"):
                    current_session["customer_profile"] = profile
                email = profile.get("email")
                name = profile.get("name") or "Customer"
                logger.info(
                    "[routing] session=%s triggering open banking email email=%s name=%s profile_keys=%s",
                    session_id,
                    email,
                    name,
                    sorted(profile.keys()) if isinstance(profile, dict) else [],
                )
                if email:
                    try:
                        send_open_banking_email(email, name)
                    except Exception as exc:
                        logger.error("Failed to trigger Open Banking email for session %s: %s", session_id, exc)
                else:
                    logger.warning(
                        "[routing] session=%s skipped open banking email because customer_profile.email is missing",
                        session_id,
                    )
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            prompt_map = {
                "modify_section": "Which section would you like to update?",
                "modify_personal": "Please update your personal details below.",
                "modify_address_choice": "Would you like to update your existing address or add a new address?",
                "modify_address": "Please update your address details below.",
                "modify_employment": "Please update your employment details below.",
                "modify_income": "Please update your income details below.",
                "modify_income_upload_statement": "Please upload your bank statement below.",
                "open_banking_email_sent": "An email has been sent to your registered ID. Please link your account.",
            }
            ui_flags = {"allow_upload": target_sub_step == "modify_income_upload_statement"}
            return StreamingResponse(
                _build_sse_stream(prompt_map.get(target_sub_step, "Please continue."), widget_spec, ui_flags),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
            )

        expenses_confirm_payload = _extract_prefixed_json_payload(last_user_msg, "UPDATE_EXPENSES_CONFIRM")
        if expenses_confirm_payload is not None:
            _apply_deterministic_profile_update(current_session, "UPDATE_EXPENSES", expenses_confirm_payload)
            _start_expenses_saving(current_session)
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = "Saving your monthly expenses. Please wait while we save your expense details."
            return StreamingResponse(
                _build_sse_stream(response_text, widget_spec),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
            )

        update_commands = (
            "UPDATE_PERSONAL",
            "UPDATE_ADDRESS",
            "UPDATE_EMPLOYMENT",
            "UPDATE_INCOME",
            "UPDATE_EXPENSES",
        )
        for command in update_commands:
            payload = _extract_prefixed_json_payload(last_user_msg, command)
            if payload is None:
                continue
            if command == "UPDATE_EMPLOYMENT":
                _stage_pending_profile_update(current_session, "employment", {
                    "type": payload.get("type"),
                    "industry": payload.get("industry"),
                    "employer": payload.get("employer"),
                    "experience": payload.get("experience"),
                    "workAddress": payload.get("workAddress"),
                })
                current_session["sub_step"] = "modify_employment_document_pending"
                current_session.pop("pending_income_verification", None)
                _store_gateway_session(session_id, current_session)
                widget_spec = resolve_widget(current_session, None)
                response_text = "Please upload your employment verification document below."
                return StreamingResponse(
                    _build_sse_stream(response_text, widget_spec, {"allow_upload": True}),
                    media_type="text/event-stream",
                    headers={
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                        "x-vercel-ai-ui-message-stream": "v1",
                    },
                )

            if command == "UPDATE_INCOME":
                _stage_pending_profile_update(current_session, "income", {
                    "monthly": payload.get("monthly"),
                    "obligations": payload.get("obligations"),
                    "creditCardLimit": payload.get("creditCardLimit"),
                })
                monthly_amount = _extract_income_amount(str(payload.get("monthly") or ""))
                if monthly_amount is not None:
                    _apply_pending_income_amount(current_session, monthly_amount)
                current_session["sub_step"] = "modify_income_proof_choice"
                current_session["pending_income_verification"] = None
                _store_gateway_session(session_id, current_session)
                widget_spec = resolve_widget(current_session, None)
                response_text = "Please choose how you'd like to verify your income."
                return StreamingResponse(
                    _build_sse_stream(response_text, widget_spec),
                    media_type="text/event-stream",
                    headers={
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                        "x-vercel-ai-ui-message-stream": "v1",
                    },
                )

            updated_section = _apply_deterministic_profile_update(current_session, command, payload)
            if not updated_section:
                continue
            if command == "UPDATE_EXPENSES":
                current_session["sub_step"] = "expenses"
                current_session["expenses_editing"] = False
                _store_gateway_session(session_id, current_session)
                widget_spec = resolve_widget(current_session, None)
                response_text = "Your monthly expenses have been updated."
                return StreamingResponse(
                    _build_sse_stream(response_text, widget_spec),
                    media_type="text/event-stream",
                    headers={
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                        "x-vercel-ai-ui-message-stream": "v1",
                    },
                )
            current_session["sub_step"] = "updating_details"
            current_session["updating"] = {
                "section": updated_section,
                "auto_advance_ms": 3000,
                "next_message": "update_complete",
                "silent": True,
            }
            current_session.pop("profile_completion", None)
            current_session.pop("profile_completion_stage", None)
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = "We are updating your details now. Please wait while we save the changes."
            return StreamingResponse(
                _build_sse_stream(response_text, widget_spec),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
            )

    # Quick-path: the personal-details proceed gate should not depend on LLM classification.
    if (
        current_session.get("step") == "identity"
        and current_session.get("sub_step") == "personal_details"
    ):
        personal_completion_state = _get_personal_completion_state(current_session)
        completion_stage = current_session.get("profile_completion_stage")
        if not personal_completion_state and _is_continuation_message(last_user_msg):
            current_session["sub_step"] = "expenses"
            _store_gateway_session(session_id, current_session)
            widget_spec = resolve_widget(current_session, None)
            response_text = "Let's proceed to your monthly expenses review."
            return StreamingResponse(
                _build_sse_stream(response_text, widget_spec),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "x-vercel-ai-ui-message-stream": "v1",
                },
            )
        if personal_completion_state and completion_stage != PERSONAL_COMPLETION_STAGE_COLLECTING:
            if _is_continuation_message(last_user_msg):
                current_session["profile_completion"] = personal_completion_state
                current_session["profile_completion_stage"] = PERSONAL_COMPLETION_STAGE_COLLECTING
                _store_gateway_session(session_id, current_session)
                response_text = _build_personal_completion_prompt(personal_completion_state["current_field"])
                response_options = _build_personal_completion_options(personal_completion_state["current_field"])
                return StreamingResponse(
                    _build_sse_stream(
                        response_text,
                        None,
                        {
                            "options": response_options,
                            "optionContext": {
                                "type": "profile_completion",
                                "field": personal_completion_state["current_field"],
                            },
                        },
                    ),
                    media_type="text/event-stream",
                    headers={
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                        "x-vercel-ai-ui-message-stream": "v1",
                    },
                )
            if _is_decline_message(last_user_msg):
                current_session["profile_completion"] = personal_completion_state
                current_session["profile_completion_stage"] = PERSONAL_COMPLETION_STAGE_AWAITING_PROCEED
                _store_gateway_session(session_id, current_session)
                response_text = "No problem. Take your time and let me know when you're ready to continue."
                return StreamingResponse(
                    _build_sse_stream(response_text, None),
                    media_type="text/event-stream",
                    headers={
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                        "x-vercel-ai-ui-message-stream": "v1",
                    },
                )

    question_answer = await _answer_gateway_question_with_agent(last_user_msg, session_id, current_session)
    if question_answer:
        _store_gateway_session(session_id, current_session)
        return _stream_widget_response(question_answer, None)

    # Call agent
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{AGENT_URL}/invoke",
            json={
                "session_id": session_id,
                "messages": request.messages,
                "session": current_session,
            },
        )
        if resp.status_code != 200:
            return StreamingResponse(
                iter([f"data: {json.dumps({'type': 'error', 'error': resp.text})}\n\n"]),
                media_type="text/event-stream",
            )
        data = resp.json()

    # Update session
    updated_session = data.get("session", current_session)
    updated_session["session_id"] = session_id
    _hydrate_customer_profile_if_available(updated_session, session_id)

    _store_gateway_session(session_id, updated_session)

    personal_completion_state = None
    if updated_session.get("step") == "identity" and updated_session.get("sub_step") == "personal_details":
        personal_completion_state = _get_personal_completion_state(updated_session)
        if personal_completion_state:
            updated_session["profile_completion"] = personal_completion_state
            updated_session.setdefault("profile_completion_stage", PERSONAL_COMPLETION_STAGE_AWAITING_PROCEED)
        else:
            updated_session.pop("profile_completion", None)
            updated_session.pop("profile_completion_stage", None)
    else:
        updated_session.pop("profile_completion", None)
        updated_session.pop("profile_completion_stage", None)

    # Widget resolution — compare step/sub_step before vs after the agent call.
    # This is restart-safe: no stale in-memory _lastWidgetState involved.
    prev_step = current_session.get("step", "identity")
    prev_sub  = current_session.get("sub_step", "awaiting_id")
    prev_profile = current_session.get("customer_profile")
    prev_expenses_state = (
        bool(current_session.get("expenses_editing")),
        current_session.get("expenses_total"),
        current_session.get("expenses_breakdown"),
    )
    new_step  = updated_session.get("step", "identity")
    new_sub   = updated_session.get("sub_step", "awaiting_id")
    new_profile = updated_session.get("customer_profile")
    new_expenses_state = (
        bool(updated_session.get("expenses_editing")),
        updated_session.get("expenses_total"),
        updated_session.get("expenses_breakdown"),
    )
    profile_changed = prev_profile != new_profile
    expenses_changed = prev_expenses_state != new_expenses_state
    state_changed = (prev_step != new_step) or (prev_sub != new_sub) or profile_changed or expenses_changed

    if state_changed and new_step == "identity" and new_sub == "open_banking_email_sent":
        profile = _build_personal_widget_data(updated_session, session_id) or {}
        if profile and not updated_session.get("customer_profile"):
            updated_session["customer_profile"] = profile
        email = profile.get("email")
        name = profile.get("name") or "Customer"
        logger.info(
            "[routing] session=%s triggering open banking email email=%s name=%s profile_keys=%s",
            session_id,
            email,
            name,
            sorted(profile.keys()) if isinstance(profile, dict) else [],
        )
        if email:
            try:
                send_open_banking_email(email, name)
            except Exception as exc:
                logger.error("Failed to trigger Open Banking email for session %s: %s", session_id, exc)
        else:
            logger.warning(
                "[routing] session=%s skipped open banking email because customer_profile.email is missing",
                session_id,
            )

    if state_changed and new_step == "esign" and new_sub == "email_sent":
        profile = _build_personal_widget_data(updated_session, session_id) or updated_session.get("customer_profile") or {}
        if profile and not updated_session.get("customer_profile"):
            updated_session["customer_profile"] = profile
        email = profile.get("email")
        name = profile.get("name") or updated_session.get("collected", {}).get("full_name") or "Customer"
        logger.info(
            "[routing] session=%s triggering docusign email email=%s name=%s profile_keys=%s",
            session_id,
            email,
            name,
            sorted(profile.keys()) if isinstance(profile, dict) else [],
        )
        if email:
            try:
                send_docusign_email(email, name)
            except Exception as exc:
                logger.error("Failed to trigger Docusign email for session %s: %s", session_id, exc)
        else:
            logger.warning(
                "[routing] session=%s skipped docusign email because customer_profile.email is missing",
                session_id,
            )

    widget_spec = resolve_widget(updated_session, data.get("extract")) if state_changed else None

    if widget_spec and widget_spec.get("widget") == "PersonalDetailsWidget":
        if "data" in widget_spec:
            widget_spec["data"]["sessionId"] = session_id

    logger.info(
        "[routing] session=%s msg=%r state=%s/%s -> %s/%s changed=%s",
        session_id,
        last_user_msg,
        prev_step,
        prev_sub,
        new_step,
        new_sub,
        state_changed,
    )
    if widget_spec:
        logger.info(
            "[routing] session=%s widget=%s",
            session_id,
            widget_spec.get("widget"),
        )

    # Clean response text
    response_text = data.get("response", "No response generated.")
    response_text = re.sub(r"<WIDGET_DATA>[\s\S]*?</WIDGET_DATA>", "", response_text).strip()
    fast_response = _fast_state_response(updated_session) if state_changed else None
    if fast_response is not None:
        response_text = fast_response
    response_options = None
    post_widget_text = None

    if updated_session.get("step") == "identity" and updated_session.get("sub_step") == "personal_details":
        stage = updated_session.get("profile_completion_stage")
        if personal_completion_state:
            if stage == PERSONAL_COMPLETION_STAGE_AWAITING_PROCEED:
                post_widget_text = "Would you like to proceed with filling the missing details?"
            elif stage == PERSONAL_COMPLETION_STAGE_COLLECTING:
                response_text = _build_personal_completion_prompt(personal_completion_state["current_field"])
                response_options = _build_personal_completion_options(personal_completion_state["current_field"])
            elif profile_changed and prev_sub == "personal_details":
                post_widget_text = "Would you like to proceed with filling the missing details?"
        elif profile_changed and prev_sub == "personal_details":
            response_text = (
                "Your profile details are complete. You can now review them and choose Modify Details or Confirm & Continue."
            )

    if updated_session.get("step") == "identity" and updated_session.get("sub_step") == "modify_address_choice":
        response_text = "Would you like to update your existing address or add a new address?"

    allow_upload = (
        updated_session.get("step") == "identity"
        and updated_session.get("sub_step") in {
            "modify_employment_document_pending",
            "modify_income_upload_statement",
        }
    )

    return StreamingResponse(
        _build_sse_stream(
            response_text,
            widget_spec,
            {
                "allow_upload": allow_upload,
                **(
                    {
                        "options": response_options,
                        "optionContext": {
                            "type": "profile_completion",
                            "field": personal_completion_state["current_field"] if personal_completion_state else None,
                        },
                    }
                    if response_options and personal_completion_state
                    else {}
                ),
                **({"postText": post_widget_text} if post_widget_text else {}),
            },
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "x-vercel-ai-ui-message-stream": "v1",
        },
    )


@router.get("/chat/history/{session_id}")
async def get_history(session_id: str):
    """Return saved conversation history from agent persistence."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            gateway_session = SESSION_STORE.get(session_id) or _load_gateway_session(session_id)
            if _is_completed_journey_session(gateway_session):
                _delete_gateway_journey(session_id)
                await client.delete(f"{AGENT_URL}/conversation/{session_id}")
                return {"messages": [], "session": None, "reset": True}

            resp = await client.get(f"{AGENT_URL}/conversation/{session_id}")
            if resp.status_code == 200:
                data = resp.json()
                session = data.get("session")
                if _is_completed_journey_session(session):
                    _delete_gateway_journey(session_id)
                    await client.delete(f"{AGENT_URL}/conversation/{session_id}")
                    return {"messages": [], "session": None, "reset": True}
                return {"messages": data.get("messages", []), "session": session}
        except httpx.RequestError:
            pass
    return {"messages": [], "session": None}


@router.delete("/chat/history/{session_id}")
async def delete_history(session_id: str):
    """Delete the current journey session and conversation history."""
    _delete_gateway_journey(session_id)
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            await client.delete(f"{AGENT_URL}/conversation/{session_id}")
        except httpx.RequestError:
            logger.exception("Failed to delete agent conversation %s", session_id)
    return {"deleted": True}


@router.post("/update_customer")
async def api_update_customer(request: UpdateCustomerRequest):
    """Update customer in mock DB and session."""
    session_id = request.session_id
    national_id = request.national_id
    updated_data = request.updated_data
    
    # 1. Update the actual DB
    success = update_customer(national_id, updated_data)
    
    # 2. Update the session profile so UI reflects changes
    if session_id in SESSION_STORE:
        customer = get_customer_by_national_id(national_id)
        if customer:
            current_profile = SESSION_STORE[session_id].get("customer_profile") or {}
            SESSION_STORE[session_id]["customer_profile"] = _merge_widget_profile(
                _customer_to_widget_data(customer),
                current_profile,
            )
            
    return {"success": success}

@router.post("/chat/send_open_banking_email")
async def api_send_open_banking_email(request: OpenBankingEmailRequest):
    """Send the Open Banking consent email through the configured mail service."""
    logger.info(
        "[send_open_banking_email] request session=%s email=%s name=%s",
        request.session_id,
        request.email,
        request.name,
    )
    success = send_open_banking_email(request.email, request.name)
    logger.info(
        "[send_open_banking_email] result session=%s success=%s",
        request.session_id,
        success,
    )
    return {"success": success}

@router.post("/send_open_banking_email")
async def api_send_open_banking_email_alt(request: SendOpenBankingEmailRequest):
    """Send the Open Banking consent email through the configured mail service."""
    logger.info(
        "[send_open_banking_email_alt] request session=%s email=%s name=%s",
        request.session_id,
        request.email,
        request.name,
    )
    success = send_open_banking_email(request.email, request.name)
    logger.info(
        "[send_open_banking_email_alt] result session=%s success=%s",
        request.session_id,
        success,
    )
    return {"success": success}

@router.post("/chat/send_docusign_email")
async def api_send_docusign_email(request: DocusignEmailRequest):
    """Send the e-sign document email through the configured mail service."""
    logger.info(
        "[send_docusign_email] request session=%s email=%s name=%s",
        request.session_id,
        request.email,
        request.name,
    )
    success = send_docusign_email(request.email, request.name)
    logger.info(
        "[send_docusign_email] result session=%s success=%s",
        request.session_id,
        success,
    )
    return {"success": success}

@router.post("/send_docusign_email")
async def api_send_docusign_email_alt(request: DocusignEmailRequest):
    """Send the e-sign document email through the configured mail service."""
    logger.info(
        "[send_docusign_email_alt] request session=%s email=%s name=%s",
        request.session_id,
        request.email,
        request.name,
    )
    success = send_docusign_email(request.email, request.name)
    logger.info(
        "[send_docusign_email_alt] result session=%s success=%s",
        request.session_id,
        success,
    )
    return {"success": success}
