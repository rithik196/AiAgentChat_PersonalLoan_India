"""
Reusable OTP service — generate, send (Gupshup WhatsApp), and verify.

Storage strategy:
  - Primary: Redis with TTL (fast ephemeral OTP cache)
  - Fallback: in-memory store if Redis is unavailable

This module preserves the existing public functions:
  - send_otp(phone, purpose)
  - verify_otp(phone, code, purpose)
"""

import os
import json
import random
import logging
import urllib.parse
import time
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import httpx
import redis

logger = logging.getLogger(__name__)

# Dev fallback when Redis is unavailable.
_OTP_MEMORY_STORE: dict[tuple[str, str], dict] = {}

# ── Config ─────────────────────────────────────────────────────────────────────
FALLBACK_OTP: str = os.getenv("FALLBACK_OTP", "1995")
OTP_TTL_MINUTES: int = int(os.getenv("OTP_TTL_MINUTES", "10"))
MAX_ATTEMPTS: int = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))
OTP_RESEND_COOLDOWN_SECONDS: int = int(os.getenv("OTP_RESEND_COOLDOWN_SECONDS", "30"))
OTP_MAX_SENDS_PER_HOUR: int = int(os.getenv("OTP_MAX_SENDS_PER_HOUR", "10"))

REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Gupshup credentials — defaults mirror the Java reference implementation.
GUPSHUP_API_KEY: str = os.getenv("GUPSHUP_API_KEY", "njs7qbz8iwgz8i791z9reaq8byxb00f0")
GUPSHUP_SRC_NUMBER: str = os.getenv("GUPSHUP_SRC_NUMBER", "917834811114")
GUPSHUP_APP_NAME: str = os.getenv("GUPSHUP_APP_NAME", "CCMBANKING")
GUPSHUP_BASE_URL: str = "https://api.gupshup.io/sm/api/v1/msg"

OtpPurpose = Literal["login", "nafath", "document", "esign", "bureau", "generic"]

_redis_client: Optional[redis.Redis] = None


# ── Redis helpers ──────────────────────────────────────────────────────────────
def _otp_key(phone: str, purpose: OtpPurpose) -> str:
    return f"otp:{purpose}:{phone}"


def _cooldown_key(phone: str, purpose: OtpPurpose) -> str:
    return f"otp:cooldown:{purpose}:{phone}"


def _hourly_count_key(phone: str, purpose: OtpPurpose) -> str:
    return f"otp:count:{purpose}:{phone}"


def _get_redis_client() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    return _redis_client


def _generate_code() -> str:
    return str(random.randint(0, 9999)).zfill(4)


def _can_send_otp_redis(phone: str, purpose: OtpPurpose) -> tuple[bool, str]:
    r = _get_redis_client()

    # Short resend cooldown window.
    if r.exists(_cooldown_key(phone, purpose)):
        return False, "Please wait before requesting another OTP"

    # Rolling-ish hourly cap via one-hour TTL counter.
    count_key = _hourly_count_key(phone, purpose)
    current = r.incr(count_key)
    if current == 1:
        r.expire(count_key, 3600)
    if current > OTP_MAX_SENDS_PER_HOUR:
        return False, "OTP request limit exceeded. Try again later"

    r.set(_cooldown_key(phone, purpose), "1", ex=OTP_RESEND_COOLDOWN_SECONDS)
    return True, ""


def _store_otp_redis(phone: str, code: str, purpose: OtpPurpose) -> None:
    r = _get_redis_client()
    key = _otp_key(phone, purpose)
    r.hset(
        key,
        mapping={
            "otp_code": code,
            "attempts": 0,
            "created_at": int(time.time()),
        },
    )
    r.expire(key, OTP_TTL_MINUTES * 60)


def _store_otp_memory(phone: str, code: str, purpose: OtpPurpose) -> None:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=OTP_TTL_MINUTES)
    _OTP_MEMORY_STORE[(phone, purpose)] = {
        "otp_code": code,
        "expires_at": expires,
        "attempts": 0,
        "verified": False,
    }


def get_whatsapp_routing_number(phone: str) -> str:
    # Remove any country code or formatting for mapping comparison
    clean_phone = phone.replace("+", "").replace(" ", "")
    if clean_phone.startswith("966"):
        clean_phone = clean_phone[3:]
    if clean_phone.startswith("0"):
        clean_phone = clean_phone[1:]
        
    mapping = {
        "5114881234": "9001110716", # ETB Customer (Saudi)
        "5114886789": "7428834316", # NTB Customer (Saudi)
    }
    # Return the mapped number, or original if no mapping exists
    return mapping.get(clean_phone, phone)

def _send_via_gupshup(phone: str, otp_code: str) -> bool:
    # Determine the actual destination number for WhatsApp routing
    routed_phone = get_whatsapp_routing_number(phone)
    
    # Normalise phone to international format without '+'
    dest = routed_phone.replace("+", "").replace(" ", "")
    if dest.startswith("0"):
        dest = "966" + dest[1:]
    elif len(dest) == 10 and not dest.startswith("966"):
        dest = "91" + dest
    elif len(dest) < 12 and not any(dest.startswith(cc) for cc in ["91", "966", "1", "44"]):
        if len(dest) == 10 and dest[0] in "6789":
            dest = "91" + dest

    message_text = f"Your Raya OTP is: {otp_code}. Valid for {OTP_TTL_MINUTES} minutes. Do not share with anyone."
    message_json = json.dumps({"type": "text", "text": message_text})

    data = (
        "channel=whatsapp"
        f"&source={GUPSHUP_SRC_NUMBER}"
        f"&destination={dest}"
        f"&message={urllib.parse.quote(message_json)}"
        f"&src.name={GUPSHUP_APP_NAME}"
    )

    headers = {
        "apikey": GUPSHUP_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
    }

    try:
        resp = httpx.post(GUPSHUP_BASE_URL, content=data.encode(), headers=headers, timeout=10, verify=False)
        logger.info("Gupshup response %s: %s", resp.status_code, resp.text[:200])
        if resp.status_code in (200, 202):
            logger.info("Gupshup OTP sent to +%s", dest)
            return True
        logger.warning("Gupshup non-success status %s for +%s: %s", resp.status_code, dest, resp.text[:200])
        return False
    except Exception as exc:
        logger.error("Gupshup request failed: %s", exc)
        return False


# ── Public API ──────────────────────────────────────────────────────────────────
def send_otp(phone: str, purpose: OtpPurpose = "login") -> dict:
    code = _generate_code()

    try:
        allowed, reason = _can_send_otp_redis(phone, purpose)
        if not allowed:
            return {
                "success": False,
                "error": reason,
                "fallback_available": True,
            }

        _store_otp_redis(phone, code, purpose)
    except Exception as exc:
        logger.warning("send_otp: Redis unavailable, using memory store: %s", exc)
        _store_otp_memory(phone, code, purpose)

    whatsapp_sent = _send_via_gupshup(phone, code)
    result: dict = {
        "success": True,
        "whatsapp_sent": whatsapp_sent,
        "fallback_available": True,
    }

    if os.getenv("EXPOSE_FALLBACK_OTP", "false").lower() == "true":
        result["fallback_otp"] = FALLBACK_OTP

    return result


def verify_otp(phone: str, code: str, purpose: OtpPurpose = "login") -> bool:
    # Static fallback OTP.
    if code == FALLBACK_OTP:
        logger.info("verify_otp: fallback OTP accepted for phone=%s purpose=%s", phone, purpose)
        return True

    # Primary path: Redis
    try:
        r = _get_redis_client()
        key = _otp_key(phone, purpose)
        rec = r.hgetall(key)

        if rec:
            attempts = int(rec.get("attempts", "0"))
            if attempts >= MAX_ATTEMPTS:
                r.delete(key)
                return False

            stored_code = rec.get("otp_code", "")
            if code != stored_code:
                r.hincrby(key, "attempts", 1)
                return False

            # Success: one-time use
            r.delete(key)
            logger.info("verify_otp: Redis OTP verified for phone=%s purpose=%s", phone, purpose)
            return True
    except Exception as exc:
        logger.warning("verify_otp: Redis unavailable, checking memory fallback: %s", exc)

    # Secondary path: in-memory fallback (only when Redis failed)
    memory_rec = _OTP_MEMORY_STORE.get((phone, purpose))
    if not memory_rec:
        return False

    now = datetime.now(timezone.utc)
    if memory_rec.get("verified"):
        return False
    if memory_rec.get("attempts", 0) >= MAX_ATTEMPTS:
        return False
    if now > memory_rec["expires_at"]:
        return False
    if code != memory_rec["otp_code"]:
        memory_rec["attempts"] = memory_rec.get("attempts", 0) + 1
        return False

    memory_rec["verified"] = True
    logger.info("verify_otp: memory OTP verified for phone=%s purpose=%s", phone, purpose)
    return True
