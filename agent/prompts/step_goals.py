STEP_GOALS = {
    "identity": {
        "SA":  "Collect 10-digit Iqama or National ID, trigger Nafath",
        "UAE": "Collect Emirates ID, trigger UAE Pass",
        "IN":  "Collect PAN or Aadhaar number, trigger eKYC",
        "BH":  "Collect 9-digit CPR number",
        "KW":  "Collect 12-digit Civil ID"
    },
    "offer":    "Present bureau-based offer, customer selects loan amount",
    "trade":    "Explain Murabaha/agreement, get customer confirmation",
    "esign":    "Customer signs agreement digitally",
    "disburse": "Collect IBAN/account, confirm disbursement",
    "done":     "Journey complete — congratulate customer, offer summary"
}

EXTRACTION_SCHEMAS = {
    "identity": {
        "SA":  '{"id_number": "10-digit string or null", "id_type": "national_id | iqama"}',
        "UAE": '{"id_number": "Emirates ID format or null", "id_type": "emirates_id"}',
        "IN":  '{"id_number": "PAN 10-char or Aadhaar 12-digit or null", "id_type": "pan | aadhaar"}',
        "BH":  '{"id_number": "9-digit CPR or null", "id_type": "cpr"}',
        "KW":  '{"id_number": "12-digit civil ID or null", "id_type": "civil_id"}'
    },
    "offer":    '{"loan_amount": "number in local currency or null", "tenure_months": "number or null"}',
    "trade":    '{"confirmed": "true or null"}',
    "esign":    '{"signed": "true or null"}',
    "done":     '{}',
    "disburse": {
        "SA":  '{"iban": "SA + 22 digits or null", "account_confirmed": "true or null"}',
        "UAE": '{"iban": "AE + 21 digits or null", "account_confirmed": "true or null"}',
        "IN":  '{"account_number": "string or null", "ifsc": "11-char or null", "account_confirmed": "true or null"}',
        "BH":  '{"iban": "BH format or null", "account_confirmed": "true or null"}',
        "KW":  '{"iban": "KW format or null", "account_confirmed": "true or null"}'
    }
}
