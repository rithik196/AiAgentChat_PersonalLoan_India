"""
Quick smoke-test: connect to MSSQL and fetch customer name by phone.
Run from repo root:
    python shared/db/test_mssql.py
"""

import sys
import os

# Allow running from repo root without installing the package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from shared.db.mssql import get_connection, get_customer_name_by_phone, get_customer_by_national_id

def test_connection():
    print("Testing MSSQL connection...")
    try:
        conn = get_connection()
        conn.close()
        print("  [OK] Connection established successfully")
    except Exception as e:
        print(f"  [FAIL] Connection error: {e}")
        sys.exit(1)

def test_fetch_name_by_phone():
    phone = "8123456789"
    print(f"\nFetching customer name by phone='{phone}'...")
    name = get_customer_name_by_phone(phone)
    if name:
        print(f"  [OK] Found customer: {name}")
    else:
        print(f"  [WARN] No customer found for phone='{phone}' — did you run the INSERT?")

def test_fetch_by_national_id():
    nid = "1234567890"
    print(f"\nFetching customer by national_id='{nid}'...")
    customer = get_customer_by_national_id(nid)
    if customer:
        print(f"  [OK] Found: name={customer['name']}, phone={customer['phone']}, email={customer.get('email','')}")
    else:
        print(f"  [WARN] No customer found for national_id='{nid}' — did you run the INSERT?")

if __name__ == "__main__":
    test_connection()
    test_fetch_name_by_phone()
    test_fetch_by_national_id()
    print("\nAll tests done.")
