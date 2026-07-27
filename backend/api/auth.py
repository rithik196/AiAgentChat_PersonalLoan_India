"""
Auth API — OTP-based login with Gupshup WhatsApp delivery.

Endpoints:
  POST /send-otp   → generate & deliver 4-digit OTP via WhatsApp
  POST /verify-otp → verify OTP and issue session cookie
  GET  /me         → validate existing session cookie
"""

from fastapi import APIRouter, Response, Request
from pydantic import BaseModel
import base64
import time
import logging

from services.otp import send_otp, verify_otp

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory session store (demo; replace with Redis in prod)
USER_STORE: dict[str, dict] = {}


class PhoneRequest(BaseModel):
    phone: str
    purpose: str = "login"


class VerifyOtpRequest(BaseModel):
    phone: str
    otp: str
    purpose: str = "login"


def _clean_phone(phone: str) -> str:
    return phone.strip().replace(" ", "").removeprefix("+966")


def _issue_session(phone: str, response: Response) -> dict:
    """Create a session token, store it, set cookie, return auth payload."""
    token = base64.urlsafe_b64encode(f"{phone}:{int(time.time())}".encode()).decode()
    USER_STORE[token] = {"phone": phone, "loggedInAt": time.time()}
    response.set_cookie(
        key="raya_session",
        value=token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=86400,  # 24 hours
    )
    return {"authenticated": True, "phone": phone}


# ── Send OTP ────────────────────────────────────────────────────────────────────
@router.post("/send-otp")
async def api_send_otp(req: PhoneRequest):
    if not req.phone:
        return {"success": False, "error": "Phone number required"}
    phone = _clean_phone(req.phone)
    result = send_otp(phone, purpose=req.purpose)
    return result


# ── Verify OTP & issue session ──────────────────────────────────────────────────
@router.post("/verify-otp")
async def api_verify_otp(req: VerifyOtpRequest, response: Response):
    if not req.phone or not req.otp:
        return {"success": False, "error": "Phone and OTP required"}
    phone = _clean_phone(req.phone)
    ok = verify_otp(phone, req.otp, purpose=req.purpose)
    if not ok:
        return {"success": False, "error": "Invalid or expired OTP"}
    return {"success": True, **_issue_session(phone, response)}


# ── Legacy login (kept for backward compat) ─────────────────────────────────────
@router.post("/login")
async def login(req: PhoneRequest, response: Response):
    """
    Direct login without OTP — retained so existing /api/auth/login callers
    still work. In production this should require prior OTP verification.
    """
    phone = _clean_phone(req.phone)
    return _issue_session(phone, response)


# ── Session check ───────────────────────────────────────────────────────────────
@router.get("/me")
async def me(request: Request):
    token = request.cookies.get("raya_session")
    if not token:
        return {"authenticated": False}
    try:
        decoded = base64.urlsafe_b64decode(token).decode()
        phone = decoded.split(":")[0]
        if not phone:
            return {"authenticated": False}
        return {"authenticated": True, "phone": phone}
    except Exception:
        return {"authenticated": False}
