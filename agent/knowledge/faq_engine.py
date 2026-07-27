import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any


_DATA_FILE = Path(__file__).with_name("agentic_faq.json")
_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does",
    "for", "from", "have", "how", "i", "if", "in", "is", "it", "me", "my",
    "of", "on", "or", "the", "this", "to", "what", "when", "where", "which",
    "who", "why", "will", "with", "you", "your",
}


@lru_cache(maxsize=1)
def _load_faq_data() -> dict[str, Any]:
    with _DATA_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def _tokens(text: str) -> set[str]:
    return {
        token
        for token in re.split(r"[^a-z0-9]+", _normalize(text))
        if len(token) > 2 and token not in _STOPWORDS
    }


def _format_currency(value: Any) -> str:
    try:
        number = float(value)
    except Exception:
        return "SAR N/A"
    if number.is_integer():
        return f"SAR {int(number):,}"
    return f"SAR {number:,.2f}"


def _build_context(session: dict[str, Any]) -> dict[str, str]:
    finance = session.get("finance_summary", {}) or {}
    offer = session.get("offer", {}) or {}
    account = session.get("selected_account", {}) or {}

    amount = finance.get("amount") or offer.get("max_amount")
    tenure = finance.get("tenure") or offer.get("tenure_months")
    profit_rate = finance.get("profit_rate") or offer.get("profit_rate")
    monthly_installment = finance.get("monthly_installment")
    total_payable = finance.get("total_payable")

    return {
        "finance_amount": _format_currency(amount),
        "finance_tenure": f"{tenure} months" if tenure else "N/A",
        "profit_rate": str(profit_rate) if profit_rate else "N/A",
        "monthly_installment": _format_currency(monthly_installment),
        "total_payable": _format_currency(total_payable),
        "iban": account.get("iban") or "N/A",
        "bank_name": account.get("bank") or "N/A",
        "beneficiary": account.get("beneficiary") or "N/A",
    }


def _score_domain(message: str, message_tokens: set[str], domain: dict[str, Any]) -> float:
    score = 0.0
    keywords = domain.get("keywords", [])
    for keyword in keywords:
        keyword_norm = _normalize(keyword)
        if not keyword_norm:
            continue
        if keyword_norm in message:
            score += 5 if " " in keyword_norm else 3
            continue
        keyword_tokens = _tokens(keyword_norm)
        if not keyword_tokens:
            continue
        overlap = len(message_tokens & keyword_tokens)
        if overlap and overlap == len(keyword_tokens):
            score += 2.5
        elif overlap:
            score += overlap / max(len(keyword_tokens), 1)

    domain_tokens = _tokens(" ".join([domain.get("id", ""), domain.get("response_template", "")]))
    overlap = len(message_tokens & domain_tokens)
    if overlap:
        score += min(overlap * 0.35, 2.0)
    return score


def _is_banking_context(message: str, data: dict[str, Any]) -> bool:
    return any(_normalize(k) in message for k in data.get("banking_context_keywords", []))


def retrieve_general_query_context(message: str, session: dict[str, Any], limit: int = 3) -> dict[str, Any]:
    data = _load_faq_data()
    msg = _normalize(message)
    msg_tokens = _tokens(msg)
    context = _build_context(session)
    ranked: list[dict[str, Any]] = []

    for domain in data.get("domains", []):
        score = _score_domain(msg, msg_tokens, domain)
        if score > 0:
            ranked.append({
                "id": domain.get("id"),
                "score": round(score, 3),
                "keywords": domain.get("keywords", []),
                "response_template": domain.get("response_template", ""),
                "response": domain.get("response_template", "").format(**context).strip(),
            })

    ranked.sort(key=lambda item: item["score"], reverse=True)
    return {
        "message": message,
        "context": context,
        "matches": ranked[:limit],
        "is_banking_context": _is_banking_context(msg, data),
        "out_of_scope_message": (data.get("out_of_scope_messages") or ["Sorry, I can only assist with banking-related queries."])[0],
    }


def answer_general_query(message: str, session: dict[str, Any]) -> dict[str, Any] | None:
    msg = _normalize(message)
    if not msg:
        return None

    retrieved = retrieve_general_query_context(message, session, limit=2)
    matches = retrieved["matches"]
    if matches and matches[0]["score"] >= 2.5:
        return {"text": matches[0]["response"], "domain": matches[0]["id"], "score": matches[0]["score"]}

    if not retrieved["is_banking_context"]:
        fallback = retrieved["out_of_scope_message"]
        return {"text": fallback, "domain": "out_of_scope", "score": 0}

    return None
