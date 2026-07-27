# shared/constants/products.py

from enum import Enum

class Product(str, Enum):
    CASH_FINANCE = "cash_finance"
    HOME_LOAN = "home_loan"
    PERSONAL_LOAN = "personal_loan"

class Step(str, Enum):
    IDENTITY = "identity"
    OFFER = "offer"
    TRADE = "trade"
    ESIGN = "esign"
    DISBURSE = "disburse"
