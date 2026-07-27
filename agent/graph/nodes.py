import os
import re
import json
import logging
import sys
from pathlib import Path
from openai import AsyncOpenAI

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

from prompts.builder import build_system_prompt
from extractors.parser import parse_agent_response
from extractors.router import route_to_temporal
from graph.state import ConversationState
from knowledge.faq_engine import answer_general_query
from shared.journey_fallback import compose_fallback_response, looks_like_fallback_interruption

logger = logging.getLogger(__name__)

# ── LLM client ──────────────────────────────────────────────────────
_client: AsyncOpenAI | None = None
CLASSIFY_MODEL = "gpt-4o-mini"
RESPOND_MODEL  = "gpt-4o-mini"

CONTINUATION_PHRASES = (
    "yes",
    "yep",
    "yeah",
    "ya",
    "sure",
    "ok",
    "ohk",
    "okay",
    "alright",
    "certainly",
    "affirmative",
    "proceed",
    "continue",
    "go ahead",
    "go on",
    "begin",
    "start",
    "lets begin",
    "let's begin",
    "lets continue",
    "let's continue",
    "please proceed",
    "please continue",
    "sounds good",
    "fine",
    "confirm",
    "confirmed",
    "do it",
    "carry on",
    "move on",
    "start journey",
    "begin journey",
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
    "don't",
    "do not",
    "maybe later",
)


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI()
    return _client


async def _chat(model: str, messages: list[dict], temperature: float = 0.7) -> str:
    """Call OpenAI chat completion and return the response text."""
    resp = await _get_client().chat.completions.create(
        model=model, messages=messages, temperature=temperature
    )
    return resp.choices[0].message.content or ""


def _normalize_user_text(text: str) -> str:
    normalized = (text or "").lower().strip()
    if normalized.startswith("__sys__"):
        normalized = normalized[7:].strip()
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


_OTP_WORD_DIGITS = {
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


def _extract_spoken_otp(text: str, expected_len: int = 4) -> str | None:
    normalized = _normalize_user_text(text)
    if not normalized:
        return None

    digits = re.sub(r"\D", "", normalized)
    if len(digits) == expected_len:
        return digits

    tokens = re.findall(r"[a-z0-9]+", normalized)
    spoken_digits: list[str] = []
    for token in tokens:
        if token in _OTP_WORD_DIGITS:
            spoken_digits.append(_OTP_WORD_DIGITS[token])
        elif token.isdigit():
            spoken_digits.extend(list(token))

    if len(spoken_digits) == expected_len:
        return "".join(spoken_digits)
    if len(spoken_digits) > expected_len:
        return "".join(spoken_digits[-expected_len:])
    return None


def _contains_phrase(text: str, phrase: str) -> bool:
    pattern = rf"(?<!\w){re.escape(phrase)}(?!\w)"
    return bool(re.search(pattern, text))


def _is_decline_message(text: str) -> bool:
    normalized = _normalize_user_text(text)
    if not normalized:
        return False
    return any(_contains_phrase(normalized, phrase) for phrase in DECLINE_PHRASES)


def _is_continuation_message(text: str) -> bool:
    normalized = _normalize_user_text(text)
    if not normalized or _is_decline_message(normalized):
        return False
    return any(_contains_phrase(normalized, phrase) for phrase in CONTINUATION_PHRASES)


# ═════════════════════════════════════════════════════════════════════
# NODE 1: CLASSIFY INTENT
# Lightweight LLM call — classify what user wants + extract structured data
# ═════════════════════════════════════════════════════════════════════
async def classify_intent(state: ConversationState) -> ConversationState:
    session = state.get("session", {})
    messages = state.get("messages", [])

    # Get last user message
    last_user_msg = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            last_user_msg = m.get("content", "").strip()
            break

    if not last_user_msg:
        return {"intent": "GENERAL_QUERY", "classified_data": None}

    step = session.get("step", "identity")
    sub_step = session.get("sub_step", "awaiting_id")

    # ── Fast-path: deterministic extraction (no LLM needed) ──────────
    if looks_like_fallback_interruption(last_user_msg, session):
        logger.info("[classify] Fallback interruption at %s/%s", step, sub_step)
        return {"intent": "GENERAL_QUERY", "classified_data": None}

    deterministic = _deterministic_classify(last_user_msg, step, sub_step, session)
    if deterministic:
        logger.info(f"[classify] Deterministic: intent={deterministic['intent']}, data={deterministic.get('data')}")
        return {
            "intent": deterministic["intent"],
            "classified_data": deterministic
        }

    # ── LLM classification for ambiguous messages ────────────────────
    classify_prompt = _build_classify_prompt(step, sub_step, session)
    oai_messages = [
        {"role": "system", "content": classify_prompt},
        {"role": "user", "content": last_user_msg}
    ]

    try:
        text = await _chat(CLASSIFY_MODEL, oai_messages, temperature=0.0)
        parsed = _parse_classify_response(text, step)
        logger.info(f"[classify] LLM: intent={parsed.get('intent')}, data={parsed.get('data')}")
        return {
            "intent": parsed.get("intent", "GENERAL_QUERY"),
            "classified_data": parsed if parsed.get("data") else None
        }
    except Exception as e:
        logger.error(f"[classify] LLM error: {e}")
        return {"intent": "GENERAL_QUERY", "classified_data": None}


# ═════════════════════════════════════════════════════════════════════
# NODE 2: EXTRACT DATA
# Parse classification → fire Temporal signal → advance session state
# ═════════════════════════════════════════════════════════════════════
async def extract_data(state: ConversationState) -> ConversationState:
    session = state.get("session", {})
    intent = state.get("intent", "GENERAL_QUERY")
    classified = state.get("classified_data")

    if not classified or intent == "GENERAL_QUERY":
        # No data to extract — skip to response
        return {"extract": None, "session": session}

    # Build extract in the format router expects
    extract = {
        "step": classified.get("step", session.get("step", "identity")),
        "intent": intent,
        "data": classified.get("data", {}),
    }

    # Handle escalation
    if intent == "ESCALATE":
        extract["escalate"] = True
        extract["escalation_reason"] = classified.get("reason", "Customer request")

    # Route to Temporal (fires signals) + advance session state machine
    if extract.get("data") or extract.get("escalate"):
        await route_to_temporal(extract, session)
        logger.info(f"[extract] Routed: step={session.get('step')}/{session.get('sub_step')}")

    return {"extract": extract, "session": session}


# Internal routing signals — auto-sent by widgets, never shown to LLM
_ROUTING_SIGNALS = {
    "nafath approved", "loading_complete", "loading complete",
    "continue", "dedupe_complete", "dedupe complete",
    "identity_complete", "verification_loading", "done",
    "update_complete", "open_banking_complete", "document_uploaded",
    "update_personal", "update_address", "update_employment", "update_income",
    "confirm_finance_plan",
    "proceed to e-sign", "esign_email_complete",
    "accepted_offer", "accepted_pre_approved_offer",
    "accepted_max_offer", "higher_amount_requested",
    "submit_higher_amount_review", "higher_amount_review_go_back",
    "otp_verification_complete", "ivr_verification_complete",
    "complete_disbursement", "verification_declined",
    "trade_certificate_ready",
}


def _normalize_signal_text(text: str) -> str:
    normalized = (text or "").lower().strip()
    if normalized.startswith("__sys__"):
        normalized = normalized[7:].strip()
    if ":" in normalized:
        normalized = normalized.split(":", 1)[0].strip()
    return normalized


def _extract_structured_update(msg: str, prefix: str) -> dict | None:
    msg = (msg or "").strip()
    prefixes = [prefix]
    if prefix.upper().startswith("__SYS__"):
        prefixes.append(prefix[7:])
    msg_lower = msg.lower()
    if not any(msg_lower.startswith(p.lower()) for p in prefixes):
        return None
    if ":" not in msg:
        return {}
    payload = msg.split(":", 1)[1].strip()
    try:
        return json.loads(payload)
    except Exception:
        return None


def _fast_state_response(session: dict) -> str | None:
    """Deterministic response for internal routing-signal turns.

    These turns are widget/system-driven and should be instant and stable.
    """
    step = session.get("step", "identity")
    sub_step = session.get("sub_step", "")

    # After ID entry: Nafath widget text (no LLM).
    if step == "identity" and sub_step == "nafath_pending":
        return (
            "Thank you. I've sent a request to your Nafath app to securely verify your identity. "
            "Please open the Nafath app and select the number displayed to continue."
        )

    # After Nafath approval: show loader only (no text).
    if step == "identity" and sub_step == "loading":
        return "Your identity is being verified now. Please wait while we complete this step."

    # After OTP loader completion: show OTP verified widget only.
    if step == "identity" and sub_step == "verified":
        return "Your identity has been verified successfully. We are moving to the Dedupe check now."

    # After verified auto-continue: dedupe loader widget carries the message; return empty text.
    if step == "identity" and sub_step == "dedupe_check":
        return "We are running a Dedupe check to verify your records. Please wait a moment while we continue."

    # After dedupe completion: widget (Journey Overview) carries the content.
    if step == "identity" and sub_step == "identify_yourself":
        return "**Welcome aboard!** Here's a quick overview of the journey ahead and the steps you'll complete to secure your finance."

    # After Journey Overview "Yes/proceed": show profile-review text only.
    if step == "identity" and sub_step == "personal_details":
        return "I have retrieved your current profile details. Please review them to make sure everything is correct to proceed."

    if step == "identity" and sub_step == "modify_section":
        return "Which section would you like to update?"

    if step == "identity" and sub_step == "modify_personal":
        return "Please provide the updated Personal Details fields you want to change."

    if step == "identity" and sub_step == "modify_address":
        return "Please share your updated address details. You can type your full updated address in one message."

    if step == "identity" and sub_step == "modify_address_choice":
        return "Would you like to update your existing address or add a new address?"

    if step == "identity" and sub_step == "modify_employment":
        return "Please provide updated employment details."

    if step == "identity" and sub_step == "modify_employment_document_pending":
        return "Please upload a document to verify your employment using the attachment icon below."

    if step == "identity" and sub_step == "modify_income":
        return "Please provide your updated monthly income."

    if step == "identity" and sub_step == "modify_income_proof_choice":
        return "Please choose how you'd like to verify your income."

    if step == "identity" and sub_step == "modify_income_upload_statement":
        return "Please upload your bank statement using the attachment icon below."

    if step == "identity" and sub_step == "open_banking_email_sent":
        return "An email has been sent to your registered ID. Please link your account"

    if step == "identity" and sub_step == "updating_details":
        return "We are updating your details now. Please wait while we save the changes."

    if step == "identity" and sub_step == "expenses":
        if session.get("expenses_editing"):
            return "Edit the category amounts below, then save your changes."
        return "Please review your monthly expenses below, or choose Modify if you want to edit the breakdown."

    if step == "identity" and sub_step == "bureau_consent":
        return "Now we need your consent to fetch bureau records. Would you like to proceed?"

    if step == "identity" and sub_step == "eligibility_check":
        return "We are running your eligibility and due diligence checks now. Please wait while we continue."

    # After personal details confirmation: fast deterministic eligible-offer summary.
    if step == "offer" and sub_step == "bureau_consent":
        return ""

    if step == "offer" and sub_step == "pre_approved_offer":
        offer = session.get("offer", {})
        max_amount = offer.get("max_amount")
        if max_amount is None:
            return ""
        profit_rate = offer.get("profit_rate", "6.1%")
        max_tenure = offer.get("max_tenure", 60)
        return (
            f"Great news! You are pre-approved for up to **SAR {max_amount:,}** "
            f"at a profit rate of **{profit_rate}** for a maximum tenure of **{max_tenure} months**.\n\n"
            "Would you like to go ahead with this offer, or would you like to explore a higher amount?"
        )

    if step == "offer" and sub_step == "eligible":
        offer = session.get("offer", {})
        max_amount = offer.get("max_amount", 350000)
        profit_rate = offer.get("profit_rate", "6.1%")
        max_tenure = offer.get("max_tenure", 60)
        return (
            f"Your eligible finance offer is ready. You can qualify for up to **SAR {max_amount:,}** "
            f"at a profit rate of **{profit_rate}** for a maximum tenure of **{max_tenure} months**.\n\n"
            "Would you like to proceed with this offer?"
        )

    if step == "offer" and sub_step == "wants_more_decision":
        return "Is this maximum amount okay, or would you like to explore a higher amount?"

    if step == "offer" and sub_step in {"wants_more_review", "wants_more_open_banking"}:
        return "Please review the manual review request details below."

    if step == "offer" and sub_step == "wants_more_backoffice":
        return "Your request has been shared with our specialist team for manual review."

    if step == "offer" and sub_step == "slider":
        return "Please adjust the amount and tenure to your preference, then confirm to continue."

    if step == "offer" and sub_step == "summary":
        return "Your finance summary is ready. Would you like to proceed to commodity trade or modify the amount and tenure?"

    if step == "trade" and sub_step == "authorize":
        return (
            "To complete your Islamic Murabaha finance, the bank will buy the commodity on your behalf and then sell it to you at an agreed price. "
            "Your repayments are based on that agreed sale price over the selected tenure. "
            "Please review and authorize the commodity trade below."
        )

    if step == "trade" and sub_step == "certificate":
        return (
            "The commodity transaction certificate is ready. "
            "Please review it. Would you like to proceed to generate the Contract & Promissory Note?"
        )

    if step == "trade" and sub_step == "loading":
        return "The commodity trade is being executed now. Please wait while we complete it."

    if step == "trade" and sub_step == "success":
        return "The commodity trade was successful. Wait now generating the Commodity Transaction Certificate."

    if step == "esign" and sub_step == "documents":
        return (
            "The Contract & Promissory Note documents are ready. "
            "Would you like to proceed with e-signing the documents?"
        )

    if step == "esign" and sub_step == "email_sent":
        return "Your e-sign request has been sent. Please complete the signature from your email and let me know once it is done."

    if step == "disburse" and sub_step == "account":
        if session.get("customerType") == "NTB" or session.get("journeyMode") == "NTB_ENRICHMENT":
            return "Please add a new IBAN manually below to proceed with disbursement."
        return "Please select your disbursement account or add a new IBAN to proceed."

    if step == "disburse" and sub_step == "iban_validation":
        return "Your IBAN has been submitted for validation. Please confirm the details to continue."

    if step == "disburse" and sub_step == "application_summary":
        return "Please review the application summary carefully and confirm to continue."

    if step == "disburse" and sub_step == "ivr_consent":
        return "Please choose how you would like to complete the final verification: OTP or IVR."

    if step == "disburse" and sub_step == "otp_entry":
        return "Please enter the 4-digit OTP sent to your registered mobile number in the chat."

    if step == "disburse" and sub_step == "otp_verifying":
        return "Verifying the OTP now."

    if step == "disburse" and sub_step == "ivr_requested":
        return "The IVR request has started. Please verify the details through the call."

    if step == "disburse" and sub_step == "otp_success":
        return "OTP verification completed successfully."

    if step == "disburse" and sub_step == "ivr_success":
        return "IVR verification completed successfully."

    if step == "done":
        return ""

    return None


# ═════════════════════════════════════════════════════════════════════
# NODE 3: BUILD RESPONSE
# Full LLM call with updated session context → customer-facing message
# ═════════════════════════════════════════════════════════════════════
async def build_response(state: ConversationState) -> ConversationState:
    session = state.get("session", {})
    messages_payload = state.get("messages", [])
    extract = state.get("extract") or {}
    intent = state.get("intent", "GENERAL_QUERY")

    # If the latest user turn is an internal routing signal, skip LLM entirely.
    last_user = ""
    last_user_raw = ""
    for m in reversed(messages_payload):
        if m.get("role") == "user":
            last_user_raw = m.get("content", "")
            last_user = _normalize_signal_text(last_user_raw)
            break
    if last_user in _ROUTING_SIGNALS:
        if last_user in {"accepted_offer", "accepted_pre_approved_offer"} and session.get("suppress_offer_text"):
            session.pop("suppress_offer_text", None)
            return {"last_response": ""}
        fast = _fast_state_response(session)
        if fast is not None:
            return {"last_response": fast}

    # For deterministic STEP_DATA turns in key flow states, skip LLM for speed.
    if extract.get("intent") in ("STEP_DATA", "BOTH"):
        fast = _fast_state_response(session)
        if fast is not None:
            return {"last_response": fast}

    if intent == "GENERAL_QUERY" and last_user_raw:
        faq = answer_general_query(last_user_raw, session)
        if faq:
            logger.info(
                "[faq] Matched domain=%s score=%s for message=%r",
                faq.get("domain"),
                faq.get("score"),
                last_user_raw,
            )
            return {"last_response": compose_fallback_response(faq["text"], session)}

    # Build system prompt with UPDATED session (post-extraction)
    sys_prompt = build_system_prompt(session)

    # Format messages for OpenAI — skip internal routing signals so LLM
    # never reads them and cannot "jump ahead" in its response.
    oai_messages = [{"role": "system", "content": sys_prompt}]
    for m in messages_payload:
        if m["role"] == "user":
            msg_content = _normalize_signal_text(m.get("content", ""))
            if msg_content in _ROUTING_SIGNALS:
                continue  # skip — routing signal, not a real user utterance
        if m["role"] in ("user", "assistant"):
            oai_messages.append({"role": m["role"], "content": m["content"]})

    # Call LLM for response
    text = await _chat(RESPOND_MODEL, oai_messages, temperature=0.7)

    # Strip any <extract> blocks from response text (defensive)
    customer_message = re.sub(r'<extract>.*?</extract>', '', text, flags=re.DOTALL).strip()
    if intent == "GENERAL_QUERY":
        customer_message = compose_fallback_response(customer_message, session)

    return {"last_response": customer_message}


# ═════════════════════════════════════════════════════════════════════
# HELPER: Deterministic classification (no LLM needed)
# ═════════════════════════════════════════════════════════════════════
def _deterministic_classify(msg: str, step: str, sub_step: str, session: dict) -> dict | None:
    """Fast-path extraction for messages that can be classified deterministically."""
    msg_lower = msg.lower().strip()
    
    # Strip __SYS__ prefix from internal routing signals
    if msg_lower.startswith("__sys__"):
        msg_lower = msg_lower[7:]  # Remove "__sys__" prefix (7 chars)

    # ─── IDENTITY ─────────────────────────────────────
    if step == "identity":
        if sub_step == "awaiting_id":
            id_match = re.search(r'\b([12]\d{9})\b', msg)
            if id_match:
                id_number = id_match.group(1)
                id_type = "national_id" if id_number.startswith("1") else "iqama"
                return {"step": "identity", "intent": "STEP_DATA",
                        "data": {"id_number": id_number, "id_type": id_type}}

        elif sub_step == "nafath_pending":
            if _is_continuation_message(msg_lower) or any(
                _contains_phrase(msg_lower, phrase) for phrase in ("approved", "open nafath", "verify")
            ):
                return {"step": "identity", "intent": "STEP_DATA",
                        "data": {"nafath_approved": True}}

        elif sub_step == "loading":
            if _is_continuation_message(msg_lower) or any(
                _contains_phrase(msg_lower, phrase) for phrase in ("loading_complete", "nafath approved")
            ):
                return {"step": "identity", "intent": "STEP_DATA",
                        "data": {"loading_complete": True}}

        elif sub_step == "verified":
            # VerificationSuccessWidget auto-sends __SYS__continue internally
            if _is_continuation_message(msg_lower) or _contains_phrase(msg_lower, "loading_complete"):
                return {"step": "identity", "intent": "STEP_DATA",
                        "data": {"identity_complete": True}}

        elif sub_step == "dedupe_check":
            signals = ["dedupe_complete", "loading_complete"]
            if any(s in msg_lower for s in signals):
                return {"step": "identity", "intent": "STEP_DATA",
                        "data": {"dedupe_complete": True}}

        elif sub_step == "identify_yourself":
            # NTBIntroductionWidget shows — user clicks Proceed button
            if _is_continuation_message(msg_lower):
                return {"step": "identity", "intent": "STEP_DATA",
                        "data": {"proceed": True}}

        elif sub_step == "personal_details":
            payload = _extract_structured_update(msg, "__SYS__PROFILE_COMPLETION")
            if payload is not None:
                if "action" in payload:
                    return {
                        "step": "identity",
                        "intent": "STEP_DATA",
                        "data": {"profile_completion_action": payload.get("action")},
                    }
                return {
                    "step": "identity",
                    "intent": "STEP_DATA",
                    "data": {
                        "profile_completion_field": payload.get("field"),
                        "profile_completion_value": payload.get("value"),
                    },
                }
            completion_stage = session.get("profile_completion_stage")
            has_pending_profile_field = bool(
                session.get("profile_completion")
                and session.get("profile_completion", {}).get("current_field")
            )
            # Treat unset stage the same as awaiting_proceed for the first confirmation.
            if has_pending_profile_field and completion_stage != "collecting":
                if _is_continuation_message(msg_lower):
                    return {
                        "step": "identity",
                        "intent": "STEP_DATA",
                        "data": {"profile_completion_action": "proceed"},
                    }
                if _is_decline_message(msg_lower):
                    return {
                        "step": "identity",
                        "intent": "STEP_DATA",
                        "data": {"profile_completion_action": "not_now"},
                    }
            if completion_stage == "collecting" and has_pending_profile_field:
                return {
                    "step": "identity",
                    "intent": "STEP_DATA",
                    "data": {"profile_completion_value": msg.strip()},
                }
            # User explicitly confirms their details
            if "modify" in msg_lower or "not correct" in msg_lower or "change" in msg_lower:
                return {"step": "identity", "intent": "STEP_DATA", "data": {"modify_requested": True}}
            if _is_continuation_message(msg_lower) or any(
                _contains_phrase(msg_lower, phrase) for phrase in ("done", "details confirmed")
            ):
                return {"step": "identity", "intent": "STEP_DATA",
                        "data": {"identity_complete": True}}

        elif sub_step == "modify_section":
            if "personal" in msg_lower:
                return {"step": "identity", "intent": "STEP_DATA", "data": {"modify_section": "personal"}}
            if "address" in msg_lower:
                return {"step": "identity", "intent": "STEP_DATA", "data": {"modify_section": "address"}}
            if "employment" in msg_lower or "job" in msg_lower or "work" in msg_lower:
                return {"step": "identity", "intent": "STEP_DATA", "data": {"modify_section": "employment"}}
            if "income" in msg_lower:
                return {"step": "identity", "intent": "STEP_DATA", "data": {"modify_section": "income"}}

        elif sub_step in {"modify_personal", "modify_address", "modify_address_choice", "modify_employment", "modify_employment_document_pending", "modify_income_upload_statement"}:
            if "document_uploaded" in msg_lower:
                return {"step": "identity", "intent": "STEP_DATA", "data": {"document_uploaded": True}}
            if sub_step == "modify_personal":
                payload = _extract_structured_update(msg, "__SYS__UPDATE_PERSONAL")
                if payload is not None:
                    return {"step": "identity", "intent": "STEP_DATA", "data": {"update_personal": payload}}
            if sub_step == "modify_address_choice":
                if any(phrase in msg_lower for phrase in ("add new", "new address", "another address", "add another")):
                    return {"step": "identity", "intent": "STEP_DATA", "data": {"address_action": "add_new"}}
                if _is_continuation_message(msg_lower) or any(
                    phrase in msg_lower for phrase in ("update existing", "existing", "edit", "update")
                ):
                    return {"step": "identity", "intent": "STEP_DATA", "data": {"address_action": "update_existing"}}
            if sub_step == "modify_address":
                payload = _extract_structured_update(msg, "__SYS__UPDATE_ADDRESS")
                if payload is not None:
                    return {"step": "identity", "intent": "STEP_DATA", "data": {"update_address": payload}}
            if sub_step == "modify_employment":
                payload = _extract_structured_update(msg, "__SYS__UPDATE_EMPLOYMENT")
                if payload is not None:
                    return {"step": "identity", "intent": "STEP_DATA", "data": {"update_employment": payload}}
            if msg_lower:
                return {"step": "identity", "intent": "STEP_DATA", "data": {"update_value": msg.strip()}}

        elif sub_step in {"modify_income", "modify_income_proof_choice"}:
            signal = _normalize_signal_text(msg)
            if signal == "open_banking" or "open banking" in msg_lower:
                return {"step": "identity", "intent": "STEP_DATA", "data": {"open_banking": True}}
            if signal == "upload_statement" or ("upload" in msg_lower and "statement" in msg_lower):
                return {"step": "identity", "intent": "STEP_DATA", "data": {"upload_statement": True}}
            payload = _extract_structured_update(msg, "__SYS__UPDATE_INCOME")
            if payload is not None:
                return {"step": "identity", "intent": "STEP_DATA", "data": {"update_income": payload}}
            amount_match = re.search(r'\b(\d{4,6})\b', msg.replace(',', ''))
            if amount_match:
                return {
                    "step": "identity",
                    "intent": "STEP_DATA",
                    "data": {"income_value": int(amount_match.group(1))}
                }

        elif sub_step == "expenses":
            signal = _normalize_signal_text(msg)
            if signal == "expenses_modify":
                return {"step": "identity", "intent": "STEP_DATA", "data": {"modify_expenses": True}}
            if signal == "expenses_confirm":
                return {"step": "identity", "intent": "STEP_DATA", "data": {"expenses_confirmed": True}}
            payload = _extract_structured_update(msg, "__SYS__UPDATE_EXPENSES")
            if payload is not None:
                return {"step": "identity", "intent": "STEP_DATA", "data": {"update_expenses": payload}}
            if _is_continuation_message(msg_lower) or any(
                _contains_phrase(msg_lower, phrase) for phrase in ("confirm expenses", "expenses confirmed")
            ):
                return {"step": "identity", "intent": "STEP_DATA", "data": {"expenses_confirmed": True}}

        elif sub_step == "open_banking_email_sent":
            if "open_banking_linked" in msg_lower:
                return {"step": "identity", "intent": "STEP_DATA", "data": {"open_banking_linked": True}}

        elif sub_step == "updating_details":
            if "open_banking_complete" in msg_lower:
                return {"step": "identity", "intent": "STEP_DATA", "data": {"open_banking_complete": True}}
            if _is_continuation_message(msg_lower) or _contains_phrase(msg_lower, "update_complete"):
                return {"step": "identity", "intent": "STEP_DATA", "data": {"update_complete": True}}

        elif sub_step == "expenses":
            if "confirm" in msg_lower or "monthly expenses confirmed" in msg_lower:
                amount_match = re.search(r'\b(\d{3,6})\b', msg.replace(',', ''))
                if amount_match:
                    return {
                        "step": "identity",
                        "intent": "STEP_DATA",
                        "data": {"expenses_confirmed": True, "total_expenses": int(amount_match.group(1))}
                    }
                return {"step": "identity", "intent": "STEP_DATA", "data": {"expenses_confirmed": True}}

        elif sub_step == "bureau_consent":
            if "bureau_consent_granted" in msg_lower:
                return {"step": "identity", "intent": "STEP_DATA", "data": {"bureau_consent_granted": True}}
            if "bureau_consent_denied" in msg_lower:
                return {"step": "identity", "intent": "STEP_DATA", "data": {"bureau_consent_denied": True}}
            if _is_decline_message(msg_lower) or any(
                _contains_phrase(msg_lower, phrase) for phrase in ("deny", "do not consent", "don't consent", "not consent")
            ):
                return {"step": "identity", "intent": "STEP_DATA", "data": {"bureau_consent_denied": True}}

            if _is_continuation_message(msg_lower) or any(
                _contains_phrase(msg_lower, phrase) for phrase in ("consent", "agree")
            ):
                return {"step": "identity", "intent": "STEP_DATA", "data": {"bureau_consent_granted": True}}

        elif sub_step == "eligibility_check":
            if _is_continuation_message(msg_lower) or _contains_phrase(msg_lower, "eligibility_check_complete"):
                return {"step": "identity", "intent": "STEP_DATA", "data": {"eligibility_check_complete": True}}

    # ─── OFFER ────────────────────────────────────────
    elif step == "offer":
        if sub_step == "pre_approved_offer":
            if "higher amount" in msg_lower or "need more" in msg_lower:
                return {"step": "offer", "intent": "STEP_DATA", "data": {"higher_amount_requested": True}}
            if (
                _is_continuation_message(msg_lower)
                or any(_contains_phrase(msg_lower, phrase) for phrase in ("accept", "go with offer"))
                or any(signal in msg_lower for signal in ("accepted_pre_approved_offer", "accepted_offer"))
            ):
                return {"step": "offer", "intent": "STEP_DATA", "data": {"accepted_pre_approved_offer": True}}

        elif sub_step == "eligible":
            if "higher amount" in msg_lower:
                return {"step": "offer", "intent": "STEP_DATA", "data": {"higher_amount_requested": True}}
            if _is_continuation_message(msg_lower) or any(
                _contains_phrase(msg_lower, phrase) for phrase in ("accept", "go ahead", "done")
            ):
                return {"step": "offer", "intent": "STEP_DATA", "data": {"accepted_offer": True}}
            more_signals = ["want more", "higher", "more amount", "increase amount"]
            if any(s in msg_lower for s in more_signals):
                return {"step": "offer", "intent": "STEP_DATA", "data": {"higher_amount_requested": True}}

            if _is_continuation_message(msg_lower) or any(
                _contains_phrase(msg_lower, phrase) for phrase in ("amount is okay", "maximum is okay")
            ):
                return {"step": "offer", "intent": "STEP_DATA", "data": {"accepted_max_offer": True}}

        elif sub_step in {"wants_more_review", "wants_more_open_banking"}:
            if "higher_amount_review_go_back" in msg_lower or _contains_phrase(msg_lower, "go back"):
                return {"step": "offer", "intent": "STEP_DATA", "data": {"higher_amount_review_go_back": True}}
            if "submit_higher_amount_review" in msg_lower or (
                _contains_phrase(msg_lower, "submit") and _contains_phrase(msg_lower, "review")
            ):
                return {"step": "offer", "intent": "STEP_DATA", "data": {"submit_higher_amount_review": True}}

        elif sub_step == "wants_more_decision":
            if _is_continuation_message(msg_lower) or any(
                _contains_phrase(msg_lower, phrase)
                for phrase in (
                    "accepted_max_offer",
                    "amount is okay",
                    "amount okay",
                    "maximum amount is okay",
                    "maximum is okay",
                )
            ):
                return {"step": "offer", "intent": "STEP_DATA", "data": {"accepted_max_offer": True}}

            more_signals = [
                "higher_amount_requested",
                "want more",
                "need more",
                "higher amount",
                "more amount",
                "increase amount",
            ]
            if any(s in msg_lower for s in more_signals):
                return {"step": "offer", "intent": "STEP_DATA", "data": {"higher_amount_requested": True}}
                
        elif sub_step == "slider":
            payload = _extract_structured_update(msg, "__SYS__CONFIRM_FINANCE_PLAN")
            if payload is not None:
                return {"step": "offer", "intent": "STEP_DATA", "data": {"confirm_finance_plan": payload}}
            if "higher amount" in msg_lower:
                return {"step": "offer", "intent": "STEP_DATA",
                        "data": {"higher_amount_requested": True}}
            if _is_continuation_message(msg_lower) or any(
                _contains_phrase(msg_lower, phrase) for phrase in ("confirm", "done")
            ):
                amount_match = re.search(r'(\d{4,6})', msg.replace(",", ""))
                amount = int(amount_match.group(1)) if amount_match else 250000
                return {"step": "offer", "intent": "STEP_DATA",
                        "data": {"loan_amount": amount, "tenure_months": 36}}

        elif sub_step == "summary":
            if "modify" in msg_lower or "higher amount" in msg_lower or "change" in msg_lower:
                return {"step": "offer", "intent": "STEP_DATA",
                        "data": {"higher_amount_requested": True}}
            if _is_continuation_message(msg_lower) or any(
                _contains_phrase(msg_lower, phrase) for phrase in ("trade", "commodity", "done")
            ):
                return {"step": "offer", "intent": "STEP_DATA",
                        "data": {"proceed_trade": True}}

    # ─── DISBURSE ────────────────────────────────────────
    elif step == "disburse":
        if sub_step == "account":
            # Account selection: ACCOUNT_SELECTED::iban or IBAN_ENTERED::iban
            if msg_lower.startswith("account_selected::"):
                iban = msg[len("ACCOUNT_SELECTED::"):]
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"account_selected": iban}}
            if msg_lower.startswith("iban_entered::"):
                iban = msg[len("IBAN_ENTERED::"):]
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"iban_entered": iban}}
        
        elif sub_step == "iban_validation":
            # IBAN validation: confirmation after validation widget
            if _is_continuation_message(msg_lower) or _contains_phrase(msg_lower, "correct"):
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"iban_validated": True}}
        
        elif sub_step == "application_summary":
            # Application summary: confirmation checkbox + button
            if _is_continuation_message(msg_lower) or _contains_phrase(msg_lower, "confirm"):
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"application_confirmed": True}}
        
        elif sub_step == "ivr_consent":
            # IVR consent: OTP or IVR choice
            if "otp" in msg_lower:
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"otp_method": True}}
            if "ivr" in msg_lower or "call" in msg_lower:
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"ivr_method": True}}
            decline_signals = ["no", "not now", "decline", "don't consent", "do not consent", "cancel"]
            if any(s in msg_lower for s in decline_signals):
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"verification_declined": True}}

        elif sub_step == "otp_entry":
            otp = _extract_spoken_otp(msg, expected_len=4)
            if otp:
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"otp_code": otp}}

        elif sub_step == "otp_verifying":
            signals = ["otp_verification_complete", "loading_complete", "done"]
            if any(s in msg_lower for s in signals):
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"otp_verification_complete": True}}

        elif sub_step == "ivr_requested":
            signals = ["ivr_verification_complete", "loading_complete", "done"]
            if any(s in msg_lower for s in signals):
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"ivr_verification_complete": True}}

        elif sub_step in {"otp_success", "ivr_success"}:
            if _is_continuation_message(msg_lower) or _contains_phrase(msg_lower, "complete_disbursement"):
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"complete_disbursement": True}}

    # ─── TRADE ────────────────────────────────────────
    elif step == "trade":
        if sub_step == "authorize":
            if _is_continuation_message(msg_lower) or any(
                _contains_phrase(msg_lower, phrase) for phrase in ("authorize", "i authorize")
            ):
                return {"step": "trade", "intent": "STEP_DATA",
                        "data": {"confirmed": True}}

        elif sub_step == "loading":
            # Only explicit confirmation should advance the loading gate
            if _is_continuation_message(msg_lower) or _contains_phrase(msg_lower, "loading_complete"):
                return {"step": "trade", "intent": "STEP_DATA",
                        "data": {"loading_complete": True}}

        elif sub_step == "success":
            signals = ["trade_certificate_ready", "show_certificate", "certificate_ready"]
            if any(s in msg_lower for s in signals):
                return {"step": "trade", "intent": "STEP_DATA",
                        "data": {"trade_certificate_ready": True}}

        elif sub_step == "certificate":
            if _is_continuation_message(msg_lower):
                return {"step": "trade", "intent": "STEP_DATA", "data": {"proceed_contract_prompt": True}}
            signals = [
                "proceed_contract_prompt",
                "proceed to next step",
                "next step",
            ]
            if any(s in msg_lower for s in signals):
                return {"step": "trade", "intent": "STEP_DATA",
                        "data": {"proceed_contract_prompt": True}}

        elif sub_step == "contract_prompt":
            if _is_continuation_message(msg_lower):
                return {"step": "trade", "intent": "STEP_DATA", "data": {"proceed_esign": True}}
            signals = [
                "proceed_esign",
                "proceed to e-sign",
                "generate contract",
                "contract & promissory note",
                "e-sign documents",
                "sign documents",
            ]
            if any(s in msg_lower for s in signals):
                return {"step": "trade", "intent": "STEP_DATA",
                        "data": {"proceed_esign": True}}

    # ─── ESIGN ────────────────────────────────────────
    elif step == "esign":
        if sub_step == "documents":
            if _is_continuation_message(msg_lower):
                return {"step": "esign", "intent": "STEP_DATA", "data": {"esign_nafath": True}}
            signals = [
                "proceed with e-sign",
                "proceed to e-sign",
                "generate contract",
                "contract & promissory note",
                "sign",
                "e-sign",
                "nafath",
                "ready",
                "confirm",
            ]
            if any(s in msg_lower for s in signals):
                return {"step": "esign", "intent": "STEP_DATA",
                        "data": {"esign_nafath": True}}

        elif sub_step == "otp_ivr":
            # Detect questions — don't advance on "what is OTP/IVR" type queries
            question_signals = ["what", "how", "explain", "detail", "tell me", "describe", "mean", "?"]
            is_question = any(q in msg_lower for q in question_signals)
            if is_question:
                return None  # Let LLM answer the question without advancing

            # Widget sends exact signals: "OTP Verification" or "IVR Verification"
            if msg_lower == "otp verification" or msg_lower == "otp":
                return {"step": "esign", "intent": "STEP_DATA",
                        "data": {"otp_method": "otp"}}
            elif msg_lower == "ivr verification" or msg_lower == "ivr" or msg_lower == "call":
                return {"step": "esign", "intent": "STEP_DATA",
                        "data": {"otp_method": "ivr"}}
            # Generic confirmation defaults to OTP
            if _is_continuation_message(msg_lower):
                return {"step": "esign", "intent": "STEP_DATA",
                        "data": {"otp_method": "otp"}}

        elif sub_step == "email_sent":
            if "esign_email_complete" in msg_lower or "done" in msg_lower:
                return {"step": "esign", "intent": "STEP_DATA",
                        "data": {"esign_email_complete": True}}

    # ─── DISBURSE ─────────────────────────────────────
    elif step == "disburse":
        if sub_step == "account":
            # Widget sends "ACCOUNT_SELECTED::IBAN" deterministic signal
            if msg_lower.startswith("account_selected::"):
                iban = msg.split("::", 1)[1].strip() if "::" in msg else ""
                return {"step": "disburse", "intent": "STEP_DATA",
                        "data": {"account_selected": iban or "Selected Account"}}
            # User types submit/confirm with valid IBAN context
            iban_match = re.search(r'(SA\d{2}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})', msg, re.IGNORECASE)
            if iban_match:
                iban = re.sub(r'\s', '', iban_match.group(1))
                if len(iban) == 24:
                    return {"step": "disburse", "intent": "STEP_DATA",
                            "data": {"account_selected": iban}}
            # Simple confirmations (user already selected via widget)
            if _is_continuation_message(msg_lower) or _contains_phrase(msg_lower, "submit"):
                return {"step": "disburse", "intent": "STEP_DATA",
                        "data": {"account_selected": "Current Account ****1234"}}

        elif sub_step == "ivr_consent":
            if msg_lower in {"otp verification", "otp"} or "otp" in msg_lower:
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"otp_method": True}}
            if msg_lower in {"ivr verification", "ivr", "call"} or "call me" in msg_lower:
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"ivr_method": True}}
            decline_signals = ["no", "not now", "decline", "don't consent", "do not consent", "cancel"]
            if any(s in msg_lower for s in decline_signals):
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"verification_declined": True}}

        elif sub_step == "otp_entry":
            otp = _extract_spoken_otp(msg, expected_len=4)
            if otp:
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"otp_code": otp}}

        elif sub_step == "otp_verifying":
            signals = ["otp_verification_complete", "loading_complete", "done"]
            if any(s in msg_lower for s in signals):
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"otp_verification_complete": True}}

        elif sub_step == "ivr_requested":
            signals = ["ivr_verification_complete", "loading_complete", "done"]
            if any(s in msg_lower for s in signals):
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"ivr_verification_complete": True}}

        elif sub_step in {"otp_success", "ivr_success"}:
            if _is_continuation_message(msg_lower) or _contains_phrase(msg_lower, "complete_disbursement"):
                return {"step": "disburse", "intent": "STEP_DATA", "data": {"complete_disbursement": True}}

    return None


# ═════════════════════════════════════════════════════════════════════
# HELPER: Build lightweight classify prompt
# ═════════════════════════════════════════════════════════════════════
def _build_classify_prompt(step: str, sub_step: str, session: dict) -> str:
    from prompts.step_goals import EXTRACTION_SCHEMAS

    schema = EXTRACTION_SCHEMAS.get(step, '{}')
    if isinstance(schema, dict):
        schema = schema.get(session.get("region", "SA"), schema.get("SA", '{}'))

    return f"""You are an intent classifier for a loan origination system.

Current journey state:
- Step: {step}
- Sub-step: {sub_step}
- Expected data schema: {schema}

Classify the user's message into ONE of:
- STEP_DATA: User is providing data relevant to the current step. Extract the data.
- GENERAL_QUERY: User is asking a question, greeting, or chatting (NOT providing step data).
- ESCALATE: User wants to speak to a human agent.

Respond in JSON only:
{{"intent": "STEP_DATA|GENERAL_QUERY|ESCALATE", "step": "{step}", "data": {{...extracted fields...}} }}

If intent is GENERAL_QUERY, set "data" to null.
If intent is ESCALATE, set "reason" to the escalation reason.

JSON only, no explanation."""


def _parse_classify_response(text: str, step: str) -> dict:
    """Parse the JSON from classify LLM response."""
    try:
        # Try direct JSON parse
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass
    # Try extracting JSON from markdown code blocks
    match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    # Fallback
    return {"intent": "GENERAL_QUERY", "step": step, "data": None}
