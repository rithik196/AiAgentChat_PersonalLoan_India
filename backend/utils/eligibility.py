"""
Eligibility calculation engine using Formula-tab logic.
Implements FOIR/DBR rules for maximum eligible amount calculation.
"""

def calculate_max_eligible_amount(
    monthly_income: float,
    monthly_obligations: float,
    credit_card_limit: float = 0,
    tenure_months: int = 60,
    region: str = "SA"
) -> dict:
    """
    Calculate maximum eligible amount using Formula-tab logic.
    
    Formula:
    Maximum Allowed Amount = [(Monthly Income × 35%) − Monthly Obligations − (Credit Card Limit × 5%)] × 60
    
    Args:
        monthly_income: Customer's monthly income in SAR/currency
        monthly_obligations: Customer's monthly obligations in SAR/currency
        credit_card_limit: Customer's credit card limit (optional)
        tenure_months: Loan tenure in months (default 60)
        region: SA/UAE/IN/BH/KW (affects FOIR/DBR limits)
    
    Returns:
        dict with max_amount, estimated_amount, foir_status, reason
    """
    
    # Safe defaults
    if monthly_income <= 0:
        return {
            "max_amount": 0,
            "estimated_amount": 0,
            "foir_status": "INELIGIBLE",
            "reason": "Monthly income must be greater than 0"
        }
    
    # Regional FOIR/DBR limits
    foir_limits = {
        "SA": 0.3333,  # 33.33%
        "UAE": 0.50,   # 50%
        "IN": 0.40,    # 40%
        "BH": 0.40,    # 40%
        "KW": 0.40,    # 40%
    }
    foir_limit = foir_limits.get(region, 0.3333)
    
    # Maximum Allowed Amount formula
    # = [(Monthly Income × 35%) − Monthly Obligations − (Credit Card Limit × 5%)] × 60
    credit_card_deduction = credit_card_limit * 0.05 if credit_card_limit else 0
    monthly_available = (monthly_income * 0.35) - monthly_obligations - credit_card_deduction
    
    max_amount = monthly_available * tenure_months
    max_amount = max(0, max_amount)  # Ensure non-negative
    
    # Estimated Eligible Amount (Maximum DBR)
    # = [(Monthly Income × 50%) − Monthly Obligations − (Credit Card Limit × 10%)] × Tenure
    credit_card_deduction_50 = credit_card_limit * 0.10 if credit_card_limit else 0
    monthly_available_50 = (monthly_income * 0.50) - monthly_obligations - credit_card_deduction_50
    
    estimated_amount = monthly_available_50 * tenure_months
    estimated_amount = max(0, estimated_amount)
    
    # FOIR check: monthly_obligation / monthly_income <= foir_limit
    foir_ratio = monthly_obligations / monthly_income if monthly_income > 0 else 1.0
    foir_status = "ELIGIBLE" if foir_ratio <= foir_limit else "NOT_ELIGIBLE"
    
    reason = f"FOIR ratio: {foir_ratio:.2%} (limit: {foir_limit:.2%})"
    if max_amount <= 0:
        foir_status = "NOT_ELIGIBLE"
        reason = "Monthly available amount is insufficient after obligations and credit card deductions"
    
    return {
        "max_amount": int(max_amount),
        "estimated_amount": int(estimated_amount),
        "foir_status": foir_status,
        "foir_ratio": round(foir_ratio, 4),
        "reason": reason,
    }


# IBAN Master data for validation
IBAN_MASTER = [
    {
        "iban": "SA0230400197093922590013",
        "bank": "Alawwal Bank",
        "beneficiary": "Faisal Rahman",
    },
    {
        "iban": "SA0210000011100003474306",
        "bank": "National Commercial Bank",
        "beneficiary": "Abdul Rahman",
    },
    {
        "iban": "SA0220000003031030859941",
        "bank": "Al Rajhi Bank",
        "beneficiary": "Abdul Rahman",
    },
]


def validate_iban(iban: str) -> dict:
    """
    Validate IBAN against IBAN Master.
    
    Args:
        iban: IBAN string (spaces will be stripped)
    
    Returns:
        dict with valid: bool, bank: str, beneficiary: str, reason: str
    """
    # Normalize IBAN (remove spaces)
    iban_clean = iban.replace(" ", "").upper()
    
    # Basic format check for Saudi IBAN
    if not iban_clean.startswith("SA"):
        return {"valid": False, "reason": "IBAN must start with SA (Saudi Arabia)"}
    
    if len(iban_clean) != 24:
        return {"valid": False, "reason": f"Saudi IBAN must be 24 characters (got {len(iban_clean)})"}
    
    if not iban_clean[2:].isdigit():
        return {"valid": False, "reason": "IBAN characters 3-24 must be numeric"}
    
    # Lookup in IBAN Master
    for record in IBAN_MASTER:
        if record["iban"] == iban_clean:
            return {
                "valid": True,
                "bank": record["bank"],
                "beneficiary": record["beneficiary"],
                "reason": "IBAN matched and verified"
            }
    
    return {
        "valid": False,
        "reason": "IBAN not found in our records. Please verify and try again.",
    }
