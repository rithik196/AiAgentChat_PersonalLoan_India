from fastapi import APIRouter
from db import get_customer_by_phone
from models.customer import CustomerProfile

router = APIRouter()

@router.get("/profile/{phone}", response_model=CustomerProfile)
def get_profile(phone: str):
    customer = get_customer_by_phone(phone)
    if not customer:
        return {"error": "Customer not found"}
    return customer
