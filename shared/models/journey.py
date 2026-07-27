# shared/models/journey.py

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from shared.constants.regions import Region
from shared.constants.products import Product, Step
from shared.constants.languages import Language

class LoanInput(BaseModel):
    customer_id: str
    region: Region
    product: Product
    language_pref: Language = Language.ENGLISH

class JourneyState(BaseModel):
    application_id: str
    customer_id: str
    region: Region
    product: Product
    current_step: Step
    total_steps: int = 5
    step_number: int = 1
    language: Language = Language.ENGLISH
    failed_attempts: int = 0
    collected_data: Dict[str, Any] = Field(default_factory=dict)
    offer_details: Optional[Dict[str, Any]] = None

class OfferInput(BaseModel):
    loan_amount: float
    tenure_months: Optional[int] = None
