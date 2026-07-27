import logging
import os
import sys
import uuid
import json
import re
from pathlib import Path
from temporalio.client import Client
from temporalio.service import RPCError

try:
    from backend.utils.eligibility import calculate_max_eligible_amount, validate_iban
    from backend.db import update_customer
    from backend.services.mail import send_docusign_email
except ModuleNotFoundError:
    # Allow running agent from its folder without requiring PYTHONPATH.
    repo_root = Path(__file__).resolve().parents[2]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    from backend.utils.eligibility import calculate_max_eligible_amount, validate_iban
    from backend.db import update_customer
    from backend.services.mail import send_docusign_email

logger = logging.getLogger(__name__)

# IDs starting with "1" are existing users, "2" are new users
EXISTING_USER_IDS = {"1234567890", "1111111111", "1987654321"}

# Track which sessions have a running Temporal workflow
_TEMPORAL_WORKFLOWS: dict[str, bool] = {}
_TEMPORAL_ENABLED = os.getenv("RLOS_ENABLE_TEMPORAL", "false").lower() in {"1", "true", "yes", "on"}

CUSTOMER_TYPE_ETB = "ETB"
CUSTOMER_TYPE_NTB = "NTB"
CUSTOMER_TYPE_UNKNOWN = "UNKNOWN"

JOURNEY_MODE_PRE_DEDUPE = "PRE_DEDUPE"
JOURNEY_MODE_ETB_CORE = "ETB_CORE"
JOURNEY_MODE_NTB_ENRICHMENT = "NTB_ENRICHMENT"

PREAPPROVED_ETB_AMOUNT = 60000
DEFAULT_MONTHLY_INCOME = 35650.0
OPEN_BANKING_MONTHLY_INCOME = 41250.0
DEFAULT_MONTHLY_OBLIGATIONS = 8750.0
DEFAULT_CREDIT_CARD_LIMIT = 20000.0
DEFAULT_OFFER_TENURE = 60


def _parse_currency_amount(value: object) -> float | None:
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


def _pick_first_positive_amount(*values: object, fallback: float) -> float:
    for value in values:
        parsed = _parse_currency_amount(value)
        if parsed is not None and parsed > 0:
            return parsed
    return fallback


def _resolve_eligibility_inputs(session: dict) -> dict[str, float | int]:
    collected = session.get("collected") if isinstance(session.get("collected"), dict) else {}
    profile = session.get("customer_profile") if isinstance(session.get("customer_profile"), dict) else {}
    profile_income = profile.get("income") if isinstance(profile.get("income"), dict) else {}
    pending_income_update = session.get("pending_income_update") if isinstance(session.get("pending_income_update"), dict) else {}

    if _is_open_banking_income_selected(session):
        monthly_income = OPEN_BANKING_MONTHLY_INCOME
    else:
        monthly_income = _pick_first_positive_amount(
            collected.get("monthly_income"),
            profile_income.get("monthly"),
            pending_income_update.get("monthly"),
            fallback=DEFAULT_MONTHLY_INCOME,
        )

    monthly_obligations = _pick_first_positive_amount(
        collected.get("monthly_obligations"),
        profile_income.get("obligations"),
        pending_income_update.get("obligations"),
        fallback=DEFAULT_MONTHLY_OBLIGATIONS,
    )
    credit_card_limit = _pick_first_positive_amount(
        collected.get("credit_card_limit"),
        profile_income.get("creditCardLimit"),
        pending_income_update.get("creditCardLimit"),
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


def _build_offer_from_eligibility(session: dict) -> dict:
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


def _ensure_higher_amount_workitem(session: dict) -> dict:
    workitem = session.setdefault("backoffice_workitem", {})
    if not workitem.get("applicationId"):
        workitem["applicationId"] = str(100000 + (uuid.uuid4().int % 900000))
    workitem.update({
        "customerId": session.get("collected", {}).get("id_number", ""),
        "requestedAmount": session.get("requested_amount", "above_eligible_limit"),
        "maxEligible": session.get("offer", {}).get("max_amount", 0),
        "branch": "Riyadh",
        "remarks": "Customer requested amount above automatic eligible limit. Application submitted for manual specialist review.",
    })
    return workitem

# ETB Configuration (A1a: Bureau consent mandatory for ETB)
ETB_REQUIRE_BUREAU_CONSENT = True

MODIFY_SECTION_PERSONAL = "personal"
MODIFY_SECTION_ADDRESS = "address"
MODIFY_SECTION_EMPLOYMENT = "employment"
MODIFY_SECTION_INCOME = "income"

PERSONAL_COMPLETION_FIELDS = [
    "levelOfEducation",
    "maritalStatus",
    "dependents",
    "houseType",
]

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


def _is_missing_value(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == "" or value.strip() == "-"
    return False


def _get_personal_completion_state(session: dict) -> dict | None:
    profile = session.get("customer_profile") or {}
    personal = profile.get("personal") or {}
    address = profile.get("address") or {}

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


def _apply_personal_completion_value(session: dict, field_key: str, value: str) -> None:
    cleaned = value.strip()
    profile = session.setdefault("customer_profile", {})
    personal = profile.setdefault("personal", {})
    address = profile.setdefault("address", {})

    if field_key == "levelOfEducation":
        personal["levelOfEducation"] = cleaned
        update_customer(session.get("collected", {}).get("id_number", ""), {"personal": {"levelOfEducation": cleaned}})
    elif field_key == "maritalStatus":
        personal["maritalStatus"] = cleaned
        update_customer(session.get("collected", {}).get("id_number", ""), {"personal": {"maritalStatus": cleaned}})
    elif field_key == "dependents":
        personal["dependents"] = cleaned
        update_customer(session.get("collected", {}).get("id_number", ""), {"personal": {"dependents": cleaned}})
    elif field_key == "houseType":
        address["houseType"] = cleaned
        update_customer(session.get("collected", {}).get("id_number", ""), {"address": {"houseType": cleaned}})


def _normalize_personal_completion_value(field_key: str, value: str) -> str | None:
    cleaned = value.strip()
    if not cleaned:
        return None

    if field_key == "dependents":
        if cleaned.lower() in {"6+", "6 plus", "6 or more"}:
            return "6+"
        if cleaned.isdigit() and cleaned in PERSONAL_COMPLETION_OPTIONS[field_key]:
            return cleaned
        return None

    candidates = PERSONAL_COMPLETION_OPTIONS.get(field_key, [])
    cleaned_lower = cleaned.lower()
    for option in candidates:
        if option.lower() == cleaned_lower:
            return option
    return None


def _begin_updating(session: dict, section: str, auto_advance_ms: int = 3000, next_signal: str = "update_complete", next_sub_step: str = "personal_details") -> None:
    session["sub_step"] = "updating_details"
    session["updating"] = {
        "section": section,
        "auto_advance_ms": auto_advance_ms,
        "next_message": next_signal,
        "silent": True,
        "next_sub_step": next_sub_step,
    }


def detect_user_type(id_number: str) -> str:
    """Detect user type based on ID number."""
    if id_number == "1046403930":
        return "existing"
    if id_number == "1046403940":
        return "new"
    
    if id_number in EXISTING_USER_IDS:
        return "existing"
    return "new"


def detect_customer_type(id_number: str) -> str:
    """Return the immutable customer type used for journey routing."""
    return CUSTOMER_TYPE_ETB if detect_user_type(id_number) == "existing" else CUSTOMER_TYPE_NTB


def _sync_customer_routing_fields(session: dict) -> None:
    """Keep legacy user_type aligned with immutable customerType for compatibility."""
    customer_type = session.get("customerType") or CUSTOMER_TYPE_UNKNOWN
    legacy_user_type = session.get("user_type")

    if customer_type == CUSTOMER_TYPE_UNKNOWN and legacy_user_type in {"existing", "new"}:
        customer_type = CUSTOMER_TYPE_ETB if legacy_user_type == "existing" else CUSTOMER_TYPE_NTB
        session["customerType"] = customer_type

    if customer_type == CUSTOMER_TYPE_ETB:
        session["user_type"] = "existing"
    elif customer_type == CUSTOMER_TYPE_NTB:
        session["user_type"] = "new"

    session.setdefault("journeyMode", JOURNEY_MODE_PRE_DEDUPE)
    session.setdefault("journeyOrigin", CUSTOMER_TYPE_UNKNOWN)
    session.setdefault("transitionReason", None)


def _set_customer_identity(session: dict, id_number: str) -> None:
    """Set immutable customer identity fields once from the captured ID."""
    resolved_type = detect_customer_type(id_number)
    if session.get("customerType") in (None, "", CUSTOMER_TYPE_UNKNOWN):
        session["customerType"] = resolved_type
    if session.get("journeyOrigin") in (None, "", CUSTOMER_TYPE_UNKNOWN):
        session["journeyOrigin"] = session["customerType"]
    _sync_customer_routing_fields(session)


def _route_to_etb_core(session: dict, reason: str | None = None) -> None:
    session["step"] = "offer"
    session["sub_step"] = "pre_approved_offer"
    session["step_number"] = 2
    session["journeyMode"] = JOURNEY_MODE_ETB_CORE
    session["transitionReason"] = reason

    session["offer"] = {
        "max_amount": PREAPPROVED_ETB_AMOUNT,
        "profit_rate": "6.1%",
        "max_tenure": DEFAULT_OFFER_TENURE,
    }


def _route_to_ntb_enrichment(session: dict, reason: str | None = None) -> None:
    session["step"] = "identity"
    session["sub_step"] = "identify_yourself"
    session["journeyMode"] = JOURNEY_MODE_NTB_ENRICHMENT
    session["transitionReason"] = reason


def _can_enter_ntb_enrichment(session: dict) -> bool:
    customer_type = session.get("customerType", CUSTOMER_TYPE_UNKNOWN)
    journey_mode = session.get("journeyMode", JOURNEY_MODE_PRE_DEDUPE)
    return customer_type == CUSTOMER_TYPE_NTB or journey_mode == JOURNEY_MODE_NTB_ENRICHMENT


def _ensure_customer_profile(session: dict) -> dict:
    profile = session.get("customer_profile")
    if not isinstance(profile, dict):
        profile = {}
    profile.setdefault("personal", {})
    profile.setdefault("address", {})
    profile.setdefault("employment", {})
    profile.setdefault("income", {})
    session["customer_profile"] = profile
    return profile


def _merge_profile_update(session: dict, section: str, update: dict) -> None:
    profile = _ensure_customer_profile(session)

    if section == "personal":
        personal = profile.setdefault("personal", {})
        for key in ("idExpirationDate", "levelOfEducation", "maritalStatus", "dependents"):
            if key in update and update[key] is not None:
                personal[key] = update[key]
        if "email" in update and update["email"] is not None:
            profile["email"] = update["email"]

    elif section == "address":
        address = profile.setdefault("address", {})
        for key in ("line1", "line2", "street", "city", "postalCode", "houseType"):
            if key in update and update[key] is not None:
                address[key] = update[key]

    elif section == "employment":
        employment = profile.setdefault("employment", {})
        for key in ("type", "industry", "employer", "experience"):
            if key in update and update[key] is not None:
                employment[key] = update[key]
        work_address = update.get("workAddress")
        if isinstance(work_address, dict):
            current = employment.setdefault("workAddress", {})
            for key in ("line1", "city", "postalCode"):
                if key in work_address and work_address[key] is not None:
                    current[key] = work_address[key]

    elif section == "income":
        income = profile.setdefault("income", {})
        for key in ("monthly", "obligations", "creditCardLimit"):
            if key in update and update[key] is not None:
                income[key] = update[key]
        session.setdefault("collected", {})
        monthly_income = _parse_currency_amount(income.get("monthly"))
        monthly_obligations = _parse_currency_amount(income.get("obligations"))
        credit_card_limit = _parse_currency_amount(income.get("creditCardLimit"))
        if monthly_income is not None and monthly_income > 0:
            session["collected"]["monthly_income"] = int(round(monthly_income))
        if monthly_obligations is not None and monthly_obligations > 0:
            session["collected"]["monthly_obligations"] = int(round(monthly_obligations))
        if credit_card_limit is not None and credit_card_limit > 0:
            session["collected"]["credit_card_limit"] = int(round(credit_card_limit))


def _persist_profile_update(session: dict, section: str, update: dict) -> None:
    """Persist profile changes into the live session and backing DB."""
    _ensure_customer_profile(session)
    _merge_profile_update(session, section, update)

    national_id = session.get("collected", {}).get("id_number", "")
    if national_id:
        try:
            from backend.db import update_customer
            update_customer(national_id, {section: update})
        except Exception as exc:
            logger.warning("Failed to persist %s update for %s: %s", section, national_id, exc)


def _store_pending_profile_update(session: dict, section: str, update: dict) -> None:
    pending = session.setdefault("pending_profile_updates", {})
    if not isinstance(pending, dict):
        pending = {}
        session["pending_profile_updates"] = pending
    pending[section] = update


def _consume_pending_profile_update(session: dict, section: str) -> dict | None:
    pending = session.get("pending_profile_updates")
    if not isinstance(pending, dict):
        return None
    update = pending.pop(section, None)
    if not pending:
        session.pop("pending_profile_updates", None)
    return update if isinstance(update, dict) else None


def _parse_structured_update_value(raw_value: object, prefix: str) -> dict | None:
    if not isinstance(raw_value, str):
        return None
    text = raw_value.strip()
    prefixes = [prefix]
    if prefix.upper().startswith("__SYS__"):
        prefixes.append(prefix[7:])
    text_lower = text.lower()
    if not any(text_lower.startswith(p.lower()) for p in prefixes):
        return None
    payload = text.split(":", 1)[1].strip() if ":" in text else ""
    if not payload:
        return {}
    try:
        parsed = json.loads(payload)
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def _finance_summary(amount: int, tenure: int, profit_rate_text: str | None = None) -> dict:
    rate_text = str(profit_rate_text or "6.1%").strip() or "6.1%"
    rate_match = re.search(r"([\d.]+)", rate_text)
    annual_rate = float(rate_match.group(1)) / 100 if rate_match else 0.15
    monthly_rate = annual_rate / 12
    if tenure <= 0:
        tenure = 1
    if monthly_rate > 0:
        emi = (amount * monthly_rate * (1 + monthly_rate) ** tenure) / ((1 + monthly_rate) ** tenure - 1)
    else:
        emi = amount / tenure
    return {
        "amount": amount,
        "tenure": tenure,
        "profit_rate": rate_text,
        "monthly_installment": round(emi),
        "total_payable": round(emi * tenure),
    }


async def _get_or_start_workflow(client: Client, session: dict):
    """Get existing workflow handle or start a new one."""
    application_id = session.get("application_id", f"rlos-{uuid.uuid4().hex[:8]}")
    session["application_id"] = application_id

    # If we already started this workflow, just get the handle
    if _TEMPORAL_WORKFLOWS.get(application_id):
        return client.get_workflow_handle(application_id)

    # Try to get existing workflow first
    try:
        handle = client.get_workflow_handle(application_id)
        # Verify it exists by describing it
        await handle.describe()
        _TEMPORAL_WORKFLOWS[application_id] = True
        return handle
    except Exception:
        pass

    # Start a new workflow
    try:
        from shared.models.journey import LoanInput
        from shared.constants.products import Product
        from shared.constants.regions import Region
        from shared.constants.languages import Language

        region_map = {"SA": Region.SA, "UAE": Region.UAE, "IN": Region.IN, "BH": Region.BH, "KW": Region.KW}
        region = region_map.get(session.get("region", "SA"), Region.SA)

        inp = LoanInput(
            customer_id=session.get("collected", {}).get("id_number", "unknown"),
            region=region,
            product=Product.CASH_FINANCE,
        )
        handle = await client.start_workflow(
            "RLOSWorkflow",
            inp,
            id=application_id,
            task_queue="rlos-queue",
        )
        _TEMPORAL_WORKFLOWS[application_id] = True
        logger.info(f"Started Temporal workflow: {application_id}")
        return handle
    except Exception as e:
        logger.error(f"Failed to start Temporal workflow: {e}")
        raise


async def route_to_temporal(extract: dict, session: dict) -> None:
    if not extract:
        return

    intent = extract.get("intent", "")

    # Always advance session state first (works with or without Temporal)
    data = extract.get("data")
    should_send_identity_verified = False
    if data and intent in ["STEP_DATA", "BOTH"]:
        # Before advancing session state, check if we need to send identity_verified
        current_step = session.get("step", "identity")
        current_sub = session.get("sub_step", "awaiting_id")
        if current_step == "identity" and current_sub == "loading" and (data.get("loading_complete") or data.get("nafath_approved")):
            should_send_identity_verified = True
        _advance_session_state(extract, session)

    # Local-first mode: keep routing fully session-driven unless explicitly enabled.
    if not _TEMPORAL_ENABLED:
        return

    # Try to send Temporal signals (non-blocking — failures fall back to session state)
    try:
        client = await Client.connect("localhost:7233")
        workflow_handle = await _get_or_start_workflow(client, session)
    except Exception as e:
        logger.warning(f"Temporal unavailable, using session-based state: {e}")
        return

    if should_send_identity_verified:
        try:
            await workflow_handle.signal("identity_verified", data)
            logger.info(f"Temporal signal: identity_verified")
        except Exception as e:
            logger.error(f"Temporal signal failed (identity_verified): {e}")

    if extract.get("escalate"):
        logger.info(f"Signal: escalate_to_human, Reason: {extract.get('escalation_reason')}")
        try:
            await workflow_handle.signal("escalate_to_human", {"reason": extract.get("escalation_reason")})
        except Exception as e:
            logger.error(f"Temporal signal failed: {e}")
        session["step"] = "escalated"
        return

    if extract.get("failed_attempt"):
        session["failed_attempts"] = session.get("failed_attempts", 0) + 1
        if session["failed_attempts"] >= 3:
            logger.info("Signal: max_attempts_reached")
            try:
                await workflow_handle.signal("max_attempts_reached", {})
            except Exception as e:
                logger.error(f"Temporal signal failed: {e}")
            session["step"] = "escalated"
        return

    if data and intent in ["STEP_DATA", "BOTH"]:
        # Send Temporal signals based on what was extracted
        current = session.get("step")
        try:
            if current == "identity" and data.get("id_number"):
                await workflow_handle.signal("identity_received", data)
                logger.info(f"Temporal signal: identity_received")
            elif current == "offer" and data.get("loan_amount"):
                await workflow_handle.signal("offer_selected", data)
                logger.info(f"Temporal signal: offer_selected")
            elif current == "trade" and data.get("confirmed"):
                await workflow_handle.signal("trade_confirmed", data)
                logger.info(f"Temporal signal: trade_confirmed")
            elif current == "esign" and data.get("signed") or data.get("esign_nafath"):
                await workflow_handle.signal("esign_completed", data)
                logger.info(f"Temporal signal: esign_completed")
            elif current == "disburse" and data.get("account_confirmed"):
                await workflow_handle.signal("disburse_confirmed", data)
                logger.info(f"Temporal signal: disburse_confirmed")
        except Exception as e:
            logger.error(f"Temporal signal failed (non-fatal): {e}")


def _advance_session_state(extract: dict, session: dict) -> None:
    """Advance session state machine based on extracted data.
    This handles sub-step transitions for the guided autonomy engine."""
    
    data = extract.get("data", {})
    if not data:
        return

    _sync_customer_routing_fields(session)
    
    current_step = session.get("step", "identity")
    current_sub = session.get("sub_step", "awaiting_id")

    # ═══════════════════════════════════════════
    # STEP 1: IDENTITY
    # ═══════════════════════════════════════════
    if current_step == "identity":
        if data.get("id_number") and current_sub == "awaiting_id":
            # Validate ID format: must be exactly 10 digits starting with 1 or 2
            id_number = str(data["id_number"]).strip()
            if not (len(id_number) == 10 and id_number[0] in ("1", "2") and id_number.isdigit()):
                logger.warning(f"Invalid ID format rejected: {id_number}")
                return  # Don't advance — let LLM ask user to retry
            _set_customer_identity(session, id_number)
            session["collected"]["id_number"] = id_number
            session["collected"]["id_type"] = data.get("id_type", "national_id")
            session["sub_step"] = "nafath_pending"
            session["nafath_code"] = int(str(hash(id_number))[-2:].replace("-", "")) % 90 + 10
            logger.info(
                "ID received: %s, customerType: %s, nafath_code: %s",
                id_number,
                session.get("customerType"),
                session["nafath_code"],
            )

        elif data.get("nafath_approved") and current_sub == "nafath_pending":
            session["sub_step"] = "loading"
            logger.info("Nafath approved, transitioning to loading...")

        elif current_sub == "loading" and (data.get("loading_complete") or data.get("nafath_approved")):
            session["sub_step"] = "verified"
            logger.info("Verification complete")

        elif current_sub == "verified" and (data.get("identity_complete") or data.get("loading_complete") or data.get("continue")):
            session["sub_step"] = "dedupe_check"
            logger.info("Starting dedupe check...")

        elif current_sub == "dedupe_check" and data.get("dedupe_complete"):
            customer_type = session.get("customerType", CUSTOMER_TYPE_UNKNOWN)
            if customer_type == CUSTOMER_TYPE_ETB:
                _route_to_etb_core(session)
                logger.info("Dedupe identified ETB. Routing to pre-approved offer.")
            else:
                _route_to_ntb_enrichment(session)
                logger.info("Dedupe identified NTB. Showing journey introduction.")

        elif current_sub == "identify_yourself":
            if not _can_enter_ntb_enrichment(session):
                logger.warning("Blocked invalid identify_yourself transition for session with customerType=%s journeyMode=%s", session.get("customerType"), session.get("journeyMode"))
                return
            if data.get("proceed"):
                session["sub_step"] = "personal_details"
                logger.info("NTB user proceeded. Showing personal details.")
            elif data.get("cancel"):
                session["step"] = "done"
                session["sub_step"] = "cancel"
                logger.info("User cancelled at identify_yourself.")

        elif current_sub == "personal_details":
            completion_state = _get_personal_completion_state(session)
            completion_stage = session.get("profile_completion_stage")
            profile_completion_action = data.get("profile_completion_action")
            explicit_completion_field = data.get("profile_completion_field")
            profile_completion_value = data.get("profile_completion_value")

            if profile_completion_action == "proceed" and completion_state:
                session["profile_completion_stage"] = "collecting"
                session["profile_completion"] = completion_state
                logger.info("Customer chose to proceed with missing personal fields.")
                return

            if profile_completion_action == "not_now" and completion_state:
                session["profile_completion_stage"] = "awaiting_proceed"
                session["profile_completion"] = completion_state
                logger.info("Customer deferred filling missing personal fields.")
                return

            if profile_completion_value is not None and (completion_stage == "collecting" or explicit_completion_field):
                pending_field = explicit_completion_field or completion_state.get("current_field")
                if pending_field:
                    normalized_value = _normalize_personal_completion_value(pending_field, str(profile_completion_value))
                    if normalized_value is not None:
                        _apply_personal_completion_value(session, pending_field, normalized_value)
                        completion_state = _get_personal_completion_state(session)
                        if completion_state:
                            session["profile_completion"] = completion_state
                            session["profile_completion_stage"] = "collecting"
                            logger.info("Captured missing personal field %s. Remaining: %s", pending_field, completion_state.get("missing_fields"))
                        else:
                            session.pop("profile_completion", None)
                            session.pop("profile_completion_stage", None)
                            logger.info("All personal details completed. Showing action buttons.")
                    else:
                        session["profile_completion"] = completion_state
                        session["profile_completion_stage"] = "collecting"
                        logger.info("Ignored invalid value for personal completion field %s.", pending_field)
                return

            if completion_state:
                session["profile_completion"] = completion_state
                session.setdefault("profile_completion_stage", "awaiting_proceed")
                logger.info("Personal details still incomplete. Waiting for proceed gate.")
                return

            if data.get("modify_requested"):
                session["sub_step"] = "modify_section"
                logger.info("Customer requested profile modification.")
            elif data.get("identity_complete") or data.get("loading_complete") or data.get("continue"):
                # Step 7 is now mandatory before eligibility.
                session["sub_step"] = "expenses"
                session.setdefault("expenses", {})
                if session.get("customerType") == CUSTOMER_TYPE_ETB or session.get("journeyMode") == JOURNEY_MODE_ETB_CORE:
                    session["expenses_prefilled"] = True
                    session["expenses_total"] = 7560
                    session["expenses_breakdown"] = {
                        "housing": "3000",
                        "food": "1500",
                        "utilities": "760",
                        "healthcare": "500",
                        "transportation": "1000",
                        "education": "800",
                    }
                    session["expenses"]["breakdown"] = session["expenses_breakdown"]
                    session["expenses"]["total"] = 7560
                logger.info("Profile confirmed. Moving to expenses collection.")

        elif current_sub == "modify_section" and data.get("modify_section"):
            selected = str(data.get("modify_section", "")).strip().lower()
            if selected in {MODIFY_SECTION_PERSONAL, MODIFY_SECTION_ADDRESS, MODIFY_SECTION_EMPLOYMENT, MODIFY_SECTION_INCOME}:
                if selected == MODIFY_SECTION_ADDRESS:
                    session["sub_step"] = "modify_address_choice"
                else:
                    session["sub_step"] = f"modify_{selected}"
                logger.info("Customer selected modification section: %s", selected)

        elif current_sub == "modify_address_choice":
            action = str(data.get("address_action", "")).strip().lower()
            if action == "add_new":
                session["modify_address_mode"] = "new"
                session["sub_step"] = "modify_address"
                logger.info("Customer chose to add a new address.")
            elif action == "update_existing":
                session["modify_address_mode"] = "existing"
                session["sub_step"] = "modify_address"
                logger.info("Customer chose to update existing address.")

        elif current_sub == "modify_personal":
            update = data.get("update_personal")
            if not isinstance(update, dict):
                update = _parse_structured_update_value(data.get("update_value"), "__SYS__UPDATE_PERSONAL")
            if isinstance(update, dict):
                _persist_profile_update(session, "personal", update)
                _begin_updating(session, "Personal details")
                logger.info("Personal details update received and persisted.")
            elif data.get("update_value"):
                _begin_updating(session, "Personal details")
                logger.info("Captured personal details update. Showing updating loader.")

        elif current_sub == "modify_address":
            update = data.get("update_address")
            if not isinstance(update, dict):
                update = _parse_structured_update_value(data.get("update_value"), "__SYS__UPDATE_ADDRESS")
            if isinstance(update, dict):
                if session.get("modify_address_mode") == "new":
                    previous_address = dict(session.get("customer_profile", {}).get("address", {}) or {})
                    if any(value not in (None, "") for value in previous_address.values()):
                        profile = _ensure_customer_profile(session)
                        addresses = profile.setdefault("additionalAddresses", [])
                        if isinstance(addresses, list):
                            addresses.append(previous_address)
                _persist_profile_update(session, "address", update)
                _begin_updating(session, "Address details")
                logger.info("Address update received and persisted.")
            elif data.get("update_value"):
                _begin_updating(session, "Address details")
                logger.info("Captured address update. Showing updating loader.")

        elif current_sub == "modify_employment":
            update = data.get("update_employment")
            if not isinstance(update, dict):
                update = _parse_structured_update_value(data.get("update_value"), "__SYS__UPDATE_EMPLOYMENT")
            if isinstance(update, dict):
                _store_pending_profile_update(session, "employment", update)
                session["sub_step"] = "modify_employment_document_pending"
                logger.info("Employment details captured. Waiting for verification document.")

        elif current_sub == "modify_employment_document_pending":
            if data.get("document_uploaded"):
                _begin_updating(session, "Employment details")
                logger.info("Employment verification document received. Showing updating loader.")

        elif current_sub == "modify_income":
            update = data.get("update_income")
            if not isinstance(update, dict):
                update = _parse_structured_update_value(data.get("update_value"), "__SYS__UPDATE_INCOME")
            if isinstance(update, dict):
                _store_pending_profile_update(session, "income", update)
                session["sub_step"] = "modify_income_proof_choice"
                logger.info("Income details captured. Waiting for proof method selection.")
            elif data.get("income_value"):
                _store_pending_profile_update(
                    session,
                    "income",
                    {"monthly": f"SAR {int(data.get('income_value')):,}"},
                )
                session["sub_step"] = "modify_income_proof_choice"
                logger.info("Income updated manually. Waiting for proof method selection.")

        elif current_sub == "modify_income_proof_choice":
            if data.get("open_banking"):
                session["income_verification_method"] = "open_banking"
                session["ntb_open_banking_income_verified"] = True
                session["sub_step"] = "open_banking_email_sent"
                logger.info("Open Banking selected. Email step started.")
            elif data.get("upload_statement"):
                session["income_verification_method"] = "upload_statement"
                session["ntb_open_banking_income_verified"] = False
                session["sub_step"] = "modify_income_upload_statement"
                logger.info("Bank statement upload path selected. Waiting for document upload.")

        elif current_sub == "open_banking_email_sent" and data.get("open_banking_linked"):
            _begin_updating(
                session,
                "Income details",
                auto_advance_ms=10000,
                next_signal="open_banking_complete",
                next_sub_step="personal_details",
            )
            logger.info("Open Banking linked. Starting 10-second update loader.")

        elif current_sub == "updating_details" and (data.get("update_complete") or data.get("open_banking_complete")):
            updating = session.get("updating") or {}
            next_sub_step = updating.get("next_sub_step", "personal_details")
            if updating.get("section") == "Employment details":
                pending_employment = _consume_pending_profile_update(session, "employment")
                if pending_employment:
                    _persist_profile_update(session, "employment", pending_employment)
            elif updating.get("section") == "Income details":
                pending_income = _consume_pending_profile_update(session, "income")
                if pending_income:
                    pending_income["monthly"] = f"SAR {int(OPEN_BANKING_MONTHLY_INCOME)}"
                    _persist_profile_update(session, "income", pending_income)
            if data.get("open_banking_complete"):
                session["expenses_prefilled"] = True
                session["expenses_total"] = 7560
                session["expenses_breakdown"] = {
                    "housing": "3000",
                    "food": "1500",
                    "utilities": "760",
                    "healthcare": "500",
                    "transportation": "1000",
                    "education": "800",
                }
                session.setdefault("expenses", {})
                session["expenses"]["breakdown"] = session["expenses_breakdown"]
                session["expenses"]["total"] = 7560

            session["sub_step"] = next_sub_step
            session.pop("updating", None)
            logger.info("Update completed. Transitioned to %s.", next_sub_step)

        elif current_sub == "modify_income_upload_statement" and data.get("document_uploaded"):
            _begin_updating(session, "Income details", next_sub_step="personal_details")
            logger.info("Income statement uploaded. Showing updating loader.")

        elif current_sub == "expenses" and data.get("expenses_confirmed"):
            total_expenses = data.get("total_expenses")
            expenses = session.setdefault("expenses", {})
            if "breakdown" not in expenses and session.get("expenses_breakdown"):
                expenses["breakdown"] = session.get("expenses_breakdown")
            if total_expenses is not None:
                expenses["total"] = total_expenses
            elif session.get("expenses_prefilled"):
                expenses["total"] = session.get("expenses_total", 7560)
            elif "total" not in expenses and session.get("expenses_total") is not None:
                expenses["total"] = session.get("expenses_total")

            session["expenses_editing"] = False
            session["sub_step"] = "bureau_consent"
            logger.info("Expenses captured. Moving to mandatory bureau consent.")

        elif current_sub == "expenses" and data.get("modify_expenses"):
            session["expenses_editing"] = True
            session.setdefault("expenses", {})
            logger.info("Customer chose to edit expenses. Re-opening expenses widget in edit mode.")

        elif current_sub == "expenses" and data.get("update_expenses"):
            update = data.get("update_expenses")
            if isinstance(update, dict):
                breakdown = update.get("breakdown") if isinstance(update.get("breakdown"), dict) else {}
                total_expenses = update.get("totalExpenses") or update.get("total_expenses") or update.get("total")
                session.setdefault("expenses", {})
                if breakdown:
                    session["expenses"]["breakdown"] = breakdown
                    session["expenses_breakdown"] = breakdown
                if total_expenses is not None:
                    session["expenses"]["total"] = total_expenses
                    session["expenses_total"] = total_expenses
                elif breakdown:
                    total_calc = 0
                    for value in breakdown.values():
                        try:
                            total_calc += float(value)
                        except (TypeError, ValueError):
                            continue
                    session["expenses"]["total"] = int(total_calc)
                    session["expenses_total"] = int(total_calc)
                session["expenses_editing"] = False
                session["sub_step"] = "bureau_consent"
                logger.info("Expenses updated and saved. Moving to mandatory bureau consent.")

        elif current_sub == "slider":
            confirm_plan = data.get("confirm_finance_plan")
            if isinstance(confirm_plan, dict):
                amount = int(confirm_plan.get("amount") or confirm_plan.get("loan_amount") or 0)
                tenure = int(confirm_plan.get("tenure") or confirm_plan.get("tenure_months") or 36)
                offer_rate = session.get("offer", {}).get("profit_rate")
                summary = _finance_summary(amount, tenure, confirm_plan.get("profitRate") or offer_rate)
                session["finance_summary"] = summary
                session["sub_step"] = "summary"
                logger.info("Finance plan confirmed. Summary computed for %s SAR over %s months.", amount, tenure)
            elif data.get("loan_amount"):
                amount = int(data.get("loan_amount") or 0)
                tenure = int(data.get("tenure_months") or 36)
                offer_rate = session.get("offer", {}).get("profit_rate")
                summary = _finance_summary(amount, tenure, offer_rate)
                session["finance_summary"] = summary
                session["sub_step"] = "summary"
                logger.info("Finance plan confirmed from legacy payload. Summary computed for %s SAR over %s months.", amount, tenure)

        elif current_sub == "bureau_consent":
            if data.get("bureau_consent_granted") or data.get("bureau_consent") == "granted":
                # Route based on journey mode (NTB vs ETB)
                journey_mode = session.get("journeyMode", JOURNEY_MODE_PRE_DEDUPE)
                session["sub_step"] = "eligibility_check"  
                logger.info("Bureau consent granted. Starting eligibility check.")
            elif data.get("bureau_consent_denied") or data.get("bureau_consent") == "denied":
                # Step 8 is mandatory: re-ask consent until granted.
                session["sub_step"] = "bureau_consent"
                logger.info("Bureau consent denied. Re-asking mandatory consent.")

        elif current_sub == "eligibility_check" and data.get("eligibility_check_complete"):
            computed_offer = _build_offer_from_eligibility(session)
            session["step"] = "offer"
            session["step_number"] = 2
            session["sub_step"] = "eligible"
            session["journeyMode"] = JOURNEY_MODE_ETB_CORE if session.get("customerType") == CUSTOMER_TYPE_ETB else JOURNEY_MODE_NTB_ENRICHMENT
            session["offer"] = {
                **(session.get("offer") or {}),
                **computed_offer,
            }
            logger.info("Eligibility check complete. Max eligible: %s SAR. Moving to eligible offer presentation.", session["offer"].get("max_amount"))

    # ═══════════════════════════════════════════
    # STEP 2: OFFER
    # ═══════════════════════════════════════════
    elif current_step == "offer":
        if current_sub == "pre_approved_offer":
            if data.get("accepted_pre_approved_offer") or data.get("accepted_offer"):
                session["suppress_offer_text"] = True
                session["step"] = "identity"
                session["sub_step"] = "bureau_consent"
                logger.info("ETB accepted pre-approved offer. Moving to SIMAH consent.")
            elif data.get("higher_amount_requested"):
                session["wants_more"] = True
                _route_to_ntb_enrichment(session, "Customer requested higher amount than pre-approved ETB offer")
                logger.info("ETB requested higher amount. Redirecting to NTB 5-step flow.")

        elif current_sub == "eligible":
            if data.get("accepted_offer"):
                session["suppress_offer_text"] = True
                session["sub_step"] = "wants_more_decision"
                logger.info("Offer viewed. Moving to mandatory wants-more decision.")
            elif data.get("higher_amount_requested"):
                session["sub_step"] = "wants_more_decision"
                logger.info("Higher amount requested early. Redirecting to mandatory wants-more decision step.")

        elif current_sub == "wants_more_decision":
            if data.get("accepted_max_offer") or data.get("accepted_offer"):
                session["sub_step"] = "slider"
                logger.info("Customer accepted maximum amount. Moving to slider.")
            elif data.get("higher_amount_requested"):
                session["sub_step"] = "wants_more_review"
                logger.info("Customer requested higher amount. Moving to manual review confirmation.")

        elif current_sub in {"wants_more_review", "wants_more_open_banking"} and data.get("higher_amount_review_go_back"):
            session["sub_step"] = "wants_more_decision"
            logger.info("Customer returned from manual review confirmation to amount decision.")

        elif current_sub in {"wants_more_review", "wants_more_open_banking"} and data.get("submit_higher_amount_review"):
            session["sub_step"] = "wants_more_backoffice"
            _ensure_higher_amount_workitem(session)
            logger.info("Higher amount request submitted for manual backoffice review.")

        elif current_sub == "slider":
            confirm_plan = data.get("confirm_finance_plan")
            if isinstance(confirm_plan, dict):
                amount = int(confirm_plan.get("amount") or confirm_plan.get("loan_amount") or 0)
                tenure = int(confirm_plan.get("tenure") or confirm_plan.get("tenure_months") or 36)
                offer_rate = session.get("offer", {}).get("profit_rate")
                summary = _finance_summary(amount, tenure, confirm_plan.get("profitRate") or offer_rate)
                session["finance_summary"] = summary
                session["finance_amount"] = amount
                session["sub_step"] = "summary"
                logger.info("Finance plan confirmed. Summary computed for %s SAR over %s months.", amount, tenure)
            elif data.get("loan_amount"):
                amount = int(data.get("loan_amount") or 0)
                tenure = int(data.get("tenure_months") or 36)
                offer_rate = session.get("offer", {}).get("profit_rate")
                summary = _finance_summary(amount, tenure, offer_rate)
                session["finance_summary"] = summary
                session["finance_amount"] = amount
                session["sub_step"] = "summary"
                logger.info("Loan configured from legacy payload. Summary computed for %s SAR over %s months.", amount, tenure)

        elif data.get("proceed_trade") and current_sub == "summary":
            session["step"] = "trade"
            session["step_number"] = 3
            session["sub_step"] = "authorize"
            logger.info("Moving to commodity trade authorization")
        elif data.get("higher_amount_requested") and current_sub == "summary":
            session["sub_step"] = "slider"
            logger.info("Customer wants to modify amount/tenure. Returning to slider.")

    # ═══════════════════════════════════════════
    # STEP 3: TRADE
    # ═══════════════════════════════════════════
    elif current_step == "trade":
        if current_sub == "authorize" and data.get("confirmed"):
            session["sub_step"] = "loading"
            logger.info("Trade authorized. Starting execution loader.")

        elif current_sub == "loading" and (data.get("loading_complete") or data.get("confirmed")):
            session["sub_step"] = "success"
            logger.info("Trade execution complete")
        
        elif (data.get("trade_certificate_ready") or data.get("confirmed")) and current_sub == "success":
            session["sub_step"] = "certificate"
            logger.info("Showing commodity transaction certificate")
            
        elif data.get("proceed_contract_prompt") and current_sub == "certificate":
            session["sub_step"] = "contract_prompt"
            logger.info("Showing generate contract prompt widget")

        elif data.get("proceed_esign") and current_sub == "contract_prompt":
            profile = session.get("customer_profile") or {}
            email = profile.get("email")
            name = profile.get("name") or session.get("collected", {}).get("full_name") or "Customer"
            if email and not session.get("docusign_email_sent"):
                try:
                    if send_docusign_email(email, name):
                        session["docusign_email_sent"] = True
                except Exception:
                    logger.exception("Failed to trigger docusign email for session %s", session.get("session_id", ""))
            session["step"] = "esign"
            session["step_number"] = 4
            session["sub_step"] = "documents"
            logger.info("Moving to esign step")

    # ═══════════════════════════════════════════
    # STEP 4: E-SIGN
    # ═══════════════════════════════════════════
    elif current_step == "esign":
        if (data.get("signed") or data.get("esign_nafath") or data.get("proceed_esign")) and current_sub == "documents":
            session["sub_step"] = "email_sent"
            logger.info("E-Sign email sent, starting wait loader")

        elif data.get("esign_email_complete") and current_sub == "email_sent":
            session["step"] = "disburse"
            session["step_number"] = 5
            session["sub_step"] = "account"
            logger.info("Moving to disbursement step")

    # ═══════════════════════════════════════════
    # STEP 5: DISBURSE
    # ═══════════════════════════════════════════
    elif current_step == "disburse":
        if current_sub == "account":
            if data.get("account_selected") or data.get("iban_entered") or data.get("account_confirmed"):
                iban = data.get("account_selected") or data.get("iban_entered") or data.get("account_number", "")
                session["selected_account"] = {"iban": iban}
                session["sub_step"] = "iban_validation"
                logger.info(f"Account selected: {iban}. Moving to IBAN validation.")
        
        elif current_sub == "iban_validation":
            if data.get("iban_validated"):
                # IBAN validation passed, store bank details
                session.setdefault("selected_account", {})
                session["selected_account"]["bank"] = data.get("bank", "") or session["selected_account"].get("bank", "")
                session["selected_account"]["beneficiary"] = data.get("beneficiary", "") or session["selected_account"].get("beneficiary", "")
                if session["selected_account"].get("iban") and (
                    not session["selected_account"].get("bank") or not session["selected_account"].get("beneficiary")
                ):
                    try:
                        from backend.utils.eligibility import validate_iban
                        iban_lookup = validate_iban(session["selected_account"].get("iban", ""))
                        if iban_lookup.get("valid"):
                            session["selected_account"]["bank"] = session["selected_account"].get("bank") or iban_lookup.get("bank", "")
                            session["selected_account"]["beneficiary"] = session["selected_account"].get("beneficiary") or iban_lookup.get("beneficiary", "")
                    except Exception:
                        logger.exception("Failed to derive bank details from IBAN during validation transition.")
                session["sub_step"] = "application_summary"
                logger.info("IBAN validation complete. Moving to application summary.")
        
        elif current_sub == "application_summary":
            if data.get("application_confirmed"):
                session["sub_step"] = "ivr_consent"
                logger.info("Application summary confirmed. Moving to IVR consent choice.")
        
        elif current_sub == "ivr_consent":
            if data.get("otp_method"):
                session["sub_step"] = "otp_entry"
                logger.info("OTP verification selected. Waiting for 4-digit OTP in chat.")
            elif data.get("ivr_method"):
                session["sub_step"] = "ivr_requested"
                logger.info("IVR verification selected. Starting IVR request loader.")
            elif data.get("verification_declined"):
                session["step"] = "offer"
                session["sub_step"] = "wants_more_backoffice"
                session["backoffice_workitem"] = {
                    "customerId": session.get("collected", {}).get("id_number", ""),
                    "remarks": "Customer did not consent to final verification. Route to RM review.",
                    "timestamp": str(uuid.uuid4()),
                }
                logger.info("Final verification declined. Routing to backoffice review.")

        elif current_sub == "otp_entry":
            otp_code = data.get("otp_code")
            if otp_code and len(str(otp_code)) == 4:
                session["sub_step"] = "otp_verifying"
                logger.info("OTP received. Starting verification loader.")

        elif current_sub == "otp_verifying":
            if data.get("otp_verification_complete") or data.get("loading_complete"):
                session["sub_step"] = "otp_success"
                session["step"] = "disburse"
                logger.info("OTP verified successfully.")

        elif current_sub == "ivr_requested":
            if data.get("ivr_verification_complete") or data.get("loading_complete"):
                session["sub_step"] = "ivr_success"
                session["step"] = "disburse"
                logger.info("IVR verification completed.")

        elif current_sub in {"otp_success", "ivr_success"}:
            if data.get("complete_disbursement") or data.get("continue") or data.get("confirmed"):
                import datetime
                selected_account = session.get("selected_account", {})
                finance_summary = session.get("finance_summary", {})
                session["disbursement"] = {
                    "reference": f"PF-2025-{str(hash(session.get('collected', {}).get('id_number', '')))[:8].upper()}",
                    "date": datetime.datetime.now().strftime("%d %B %Y"),
                    "amount": finance_summary.get("amount", 0),
                    "account": selected_account.get("iban", "****1234"),
                    "tenure": f"{finance_summary.get('tenure', 0)} Months",
                    "profit_rate": finance_summary.get("profit_rate", ""),
                    "first_installment": (datetime.datetime.now() + datetime.timedelta(days=90)).strftime("%d %B %Y"),
                    "monthly_installment": finance_summary.get("monthly_installment", 0),
                    "total_payable": finance_summary.get("total_payable", 0),
                }
                session["step"] = "done"
                session["sub_step"] = "complete"
                logger.info("Final verification complete. Showing disbursement success screen.")
