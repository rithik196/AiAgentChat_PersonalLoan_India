"""
Mail service for ConsentPortal email delivery.

This module sends the Open Banking consent email through the external
ConsentPortalBackend API instead of the legacy MSSQL stored procedure path.
"""

from __future__ import annotations

import logging
import os
from urllib.parse import quote_plus
from typing import Any

import httpx

logger = logging.getLogger(__name__)

CONSENT_PORTAL_BASE_URL = os.getenv(
    "CONSENT_PORTAL_BASE_URL",
    "https://hnbdemo.newgensoftware.net/ksaMobileAppBackend/api/v1",
).rstrip("/")
CONSENT_PORTAL_EMAIL_PATH = os.getenv(
    "CONSENT_PORTAL_EMAIL_PATH",
    "/email/sendRealEstateFinanceApplicationMail",
)
DOCUSIGN_PORTAL_BASE_URL = os.getenv(
    "DOCUSIGN_PORTAL_BASE_URL",
    "https://tytlmsdemo.newgensoftware.net:8443/docusign218/qs01",
).rstrip("/")


def _build_docusign_link(
    signer_name: str,
    signer_email: str,
    doc_name: str,
    transaction_id: str,
    page: int,
) -> str:
    return (
        f"{DOCUSIGN_PORTAL_BASE_URL}"
        f"?signerName={quote_plus(signer_name)}"
        f"&signerEmail={quote_plus(signer_email)}"
        f"&docName={quote_plus(doc_name)}"
        f"&transactionId={quote_plus(transaction_id)}"
        f"&x=400&y=680&page={page}"
    )


def _build_open_banking_email(customer_name: str) -> dict[str, str]:
    subject = "Action Required: Link Your Bank Account via Open Banking"
    mail_body = f"""
<html>
<body style="font-family: Arial, sans-serif; color: #1a1a2e; background: #f8fafc; padding: 30px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
    <h2 style="color: #1B6A8A; margin-bottom: 8px;">Open Banking Account Linking</h2>
    <p style="color: #64748b; font-size: 14px; margin-bottom: 24px;">Hello {customer_name},</p>
    <p style="font-size: 15px; line-height: 1.6;">
      As requested during your finance application, please click the link below to securely link your bank account via Open Banking.
      This will allow us to verify your income and provide you with the best possible offer.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="#" style="background: linear-gradient(90deg, #1B6A8A 0%, #4BA3C7 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 30px; font-weight: 600; font-size: 15px;">
        Link My Bank Account
      </a>
    </div>
    <p style="font-size: 13px; color: #94a3b8;">
      This link is valid for 15 minutes. If you did not request this, please ignore this email or contact us immediately.
    </p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="font-size: 12px; color: #cbd5e1; text-align: center;">Powered by Raya Finance Agent</p>
  </div>
</body>
</html>
""".strip()

    return {"subject": subject, "mailBody": mail_body}


def _build_docusign_email(customer_name: str) -> dict[str, str]:
    subject = "Action Required: Review and Sign Your Documents"
    contract_url = _build_docusign_link(
        customer_name,
        "bhavya@gmail.com",
        "ContractSaudi",
        "ContractSaudi",
        9,
    )
    promissory_url = _build_docusign_link(
        customer_name,
        "bhavya@gmail.com",
        "PromissoryNote",
        "PromissoryNote",
        4,
    )
    mail_body = """
<html>
<body style="margin:0; padding:0; background:#f8fafc; font-family: Arial, sans-serif; color:#0f172a;">
  <div style="padding: 32px 20px;">
    <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 18px; padding: 32px; box-shadow: 0 8px 28px rgba(15, 23, 42, 0.08);">
      <h2 style="margin: 0 0 10px 0; color: #1B6A8A; font-size: 24px; line-height: 1.2;">E-Sign Your Documents</h2>
      <p style="margin: 0 0 18px 0; color: #64748b; font-size: 14px;">Hello {customer_name},</p>
      <p style="margin: 0 0 22px 0; font-size: 15px; line-height: 1.7; color: #0f172a;">
        Your Contract Saudi and Promissory Note documents are ready for signature. Please open each document using the button below.
      </p>

      <div style="margin: 0 0 18px 0;">
        <p style="margin: 0 0 10px 0; font-size: 15px; font-weight: 700; color: #0f172a;">Contract Saudi</p>
        <a href="{contract_url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 12px 22px; border-radius: 9999px; background: #1B739E; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700;">
          proceed to e-sign
        </a>
      </div>

      <div style="margin: 0 0 18px 0;">
        <p style="margin: 0 0 10px 0; font-size: 15px; font-weight: 700; color: #0f172a;">Promissory Note</p>
        <a href="{promissory_url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 12px 22px; border-radius: 9999px; background: #1B739E; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700;">
         proceed to e-sign
        </a>
      </div>

      <p style="margin: 22px 0 0 0; font-size: 13px; line-height: 1.6; color: #64748b;">
        If a button does not open correctly, please copy and paste the link into your browser.
      </p>
      <p style="margin: 10px 0 0 0; font-size: 12px; color: #cbd5e1; text-align: center;">Powered by Raya Finance Agent</p>
    </div>
  </div>
</body>
</html>
""".format(customer_name=customer_name, contract_url=contract_url, promissory_url=promissory_url).strip()

    return {"subject": subject, "mailBody": mail_body}


def _log_email_request(prefix: str, url: str, customer_email: str, payload: dict[str, Any]) -> None:
    logger.info("[%s] url=%s", prefix, url)
    logger.info("[%s] mailTo=%s", prefix, customer_email)
    logger.info("[%s] subject=%s", prefix, payload.get("subject"))
    logger.info("[%s] mailBody=%s", prefix, payload.get("mailBody"))


def send_open_banking_email(customer_email: str, customer_name: str) -> bool:
    """Send the Open Banking consent email through ConsentPortalBackend."""
    payload: dict[str, Any] = {
        **_build_open_banking_email(customer_name),
        "mailTo": customer_email,
        "documentIndex": "",
    }

    url = f"{CONSENT_PORTAL_BASE_URL}{CONSENT_PORTAL_EMAIL_PATH}"
    _log_email_request("ConsentPortal open banking email request prepared", url, customer_email, payload)

    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.post(url, json=payload)
        logger.info(
            "ConsentPortal open banking email API response: status=%s mailTo=%s body=%s",
            response.status_code,
            customer_email,
            response.text,
        )
        if response.status_code >= 400:
            logger.error(
                "ConsentPortal email API failed: status=%s body=%s",
                response.status_code,
                response.text,
            )
            return False

        logger.info("ConsentPortal open banking email API called successfully for: %s | url=%s", customer_email, url)
        return True
    except Exception as exc:
        logger.error("ConsentPortal email API request failed: %s", exc)
        return False


def send_docusign_email(customer_email: str, customer_name: str) -> bool:
    """Send the e-sign document email through ConsentPortalBackend."""
    payload: dict[str, Any] = {
        **_build_docusign_email(customer_name),
        "mailTo": customer_email,
        "documentIndex": "",
    }

    url = f"{CONSENT_PORTAL_BASE_URL}{CONSENT_PORTAL_EMAIL_PATH}"
    _log_email_request("ConsentPortal docusign email request prepared", url, customer_email, payload)

    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.post(url, json=payload)
        logger.info(
            "ConsentPortal docusign email API response: status=%s mailTo=%s body=%s",
            response.status_code,
            customer_email,
            response.text,
        )
        if response.status_code >= 400:
            logger.error(
                "ConsentPortal docusign email API failed: status=%s body=%s",
                response.status_code,
                response.text,
            )
            return False

        logger.info("ConsentPortal docusign email API called successfully for: %s | url=%s", customer_email, url)
        return True
    except Exception as exc:
        logger.error("ConsentPortal docusign email API request failed: %s", exc)
        return False
