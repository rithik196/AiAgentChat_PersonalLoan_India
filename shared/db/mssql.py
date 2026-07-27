"""
MSSQL Service Layer
Shared connection + query helpers for backend and agent services.
"""

import os
import logging
import pyodbc
from typing import Optional

# ---------------------------------------------------------------------------
# Connection config
# ---------------------------------------------------------------------------
_SERVER = os.getenv("MSSQL_SERVER", "34.131.53.132")
_PORT = int(os.getenv("MSSQL_PORT", "1433"))
_DATABASE = os.getenv("MSSQL_DATABASE", "sacom")
_USERNAME = os.getenv("MSSQL_USERNAME", "sa")
_PASSWORD = os.getenv("MSSQL_PASSWORD", "system123#")
_DRIVER = os.getenv("MSSQL_DRIVER", "ODBC Driver 17 for SQL Server")
_ENCRYPT = os.getenv("MSSQL_ENCRYPT", "no").lower()
_TRUST_SERVER_CERT = os.getenv("MSSQL_TRUST_SERVER_CERTIFICATE", "yes").lower()
_BYPASS_SSL = os.getenv("MSSQL_BYPASS_SSL", "true").lower() == "true"

logger = logging.getLogger(__name__)

def _build_connection_string(bypass_ssl: bool = _BYPASS_SSL) -> str:
    encrypt = "no" if bypass_ssl else _ENCRYPT
    trust_server_cert = "yes" if bypass_ssl else _TRUST_SERVER_CERT
    return (
        f"DRIVER={{{_DRIVER}}};"
        f"SERVER={_SERVER},{_PORT};"
        f"DATABASE={_DATABASE};"
        f"UID={_USERNAME};"
        f"PWD={_PASSWORD};"
        f"TrustServerCertificate={trust_server_cert};"
        f"Encrypt={encrypt};"
    )

# ---------------------------------------------------------------------------
# Connection helper
# ---------------------------------------------------------------------------

def get_connection() -> pyodbc.Connection:
    """Return a new pyodbc connection to the MSSQL database."""
    try:
        if _BYPASS_SSL:
            logger.info("MSSQL connection requested with SSL bypass enabled")
        return pyodbc.connect(_build_connection_string(), timeout=10)
    except pyodbc.Error as exc:
        # Local/dev fallback: retry without TLS enforcement if the server or
        # client stack rejects the encrypted handshake.
        if "Encryption not supported on the client" in str(exc) or "SSL Provider" in str(exc):
            fallback = _build_connection_string(True)
            logger.warning("MSSQL TLS handshake failed, retrying with SSL bypass: %s", exc)
            return pyodbc.connect(fallback, timeout=10)
        raise


# ---------------------------------------------------------------------------
# Customer queries
# ---------------------------------------------------------------------------

def get_customer_by_phone(phone: str) -> Optional[dict]:
    """
    Fetch a customer row by mobile phone number.
    Returns a dict with customer fields, or None if not found.
    """
    sql = """
        SELECT c.id, c.name, c.phone, c.national_id, c.email, c.created_at
        FROM   customers c
        WHERE  c.phone = ?
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(sql, (phone,))
        row = cursor.fetchone()
        if row is None:
            return None
        columns = [col[0] for col in cursor.description]
        return dict(zip(columns, row))


def get_customer_by_national_id(national_id: str) -> Optional[dict]:
    """
    Fetch a customer row by national ID.
    Returns a dict with customer fields, or None if not found.
    """
    sql = """
        SELECT c.id, c.name, c.phone, c.national_id, c.email, c.created_at
        FROM   customers c
        WHERE  c.national_id = ?
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(sql, (national_id,))
        row = cursor.fetchone()
        if row is None:
            return None
        columns = [col[0] for col in cursor.description]
        return dict(zip(columns, row))


def get_customer_name_by_phone(phone: str) -> Optional[str]:
    """Quick helper: returns just the customer name for a given phone number."""
    customer = get_customer_by_phone(phone)
    return customer["name"] if customer else None


def get_customer_profile_by_phone(phone: str) -> Optional[dict]:
    """
    Fetch a full customer profile row (customer + personal + employment + income)
    formatted for mapping into backend CustomerProfile model.
    """
    sql = """
        SELECT
            c.id,
            c.name,
            c.phone,
            c.national_id,
            c.email,
            c.created_at,
            p.age,
            p.gender,
            p.dob_gr,
            p.dob_hj,
            p.address AS personal_address,
            p.marital_status,
            p.nationality,
            p.father_name,
            p.grandfather_name,
            p.dependents,
            p.income_type,
            e.type AS employment_type,
            e.industry,
            e.employer,
            e.experience,
            e.address AS employment_address,
            i.monthly
        FROM customers c
        LEFT JOIN personal_details p ON p.customer_id = c.id
        LEFT JOIN employment_details e ON e.customer_id = c.id
        LEFT JOIN income_details i ON i.customer_id = c.id
        WHERE c.phone = ?
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(sql, (phone,))
        row = cursor.fetchone()
        if row is None:
            return None
        columns = [col[0] for col in cursor.description]
        return dict(zip(columns, row))
