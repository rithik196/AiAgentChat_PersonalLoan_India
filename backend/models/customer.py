# backend/models/customer.py
from pydantic import BaseModel
from typing import Optional

class AddressDetails(BaseModel):
    line1: Optional[str] = None
    line2: Optional[str] = None
    building_number: Optional[str] = None
    street: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    additional_number: Optional[str] = None
    house_type: Optional[str] = None

class PersonalDetails(BaseModel):
    id_number: str
    id_expiration_date: Optional[str] = None
    age: int
    gender: str
    dob_gr: str
    dob_hj: str
    marital_status: str
    nationality: str
    first_name: Optional[str] = None
    father_name: str
    grandfather_name: str
    last_name: Optional[str] = None
    dependents: str
    education: Optional[str] = None
    income_type: str

class EmploymentDetails(BaseModel):
    type: str
    industry: str
    employer: str
    experience: str
    work_address: Optional[AddressDetails] = None

class IncomeDetails(BaseModel):
    monthly: str
    allowances: Optional[str] = None
    obligations: Optional[str] = None
    credit_card_limit: Optional[str] = None

class CustomerProfile(BaseModel):
    name: str
    phone: str
    email: str
    personal: PersonalDetails
    address: Optional[AddressDetails] = None
    employment: EmploymentDetails
    income: IncomeDetails
