# backend/db.py
# Simple in-memory DB for demo. Replace with real DB in production.
try:
    from backend.models.customer import CustomerProfile, PersonalDetails, EmploymentDetails, IncomeDetails, AddressDetails
except ModuleNotFoundError:
    from models.customer import CustomerProfile, PersonalDetails, EmploymentDetails, IncomeDetails, AddressDetails

try:
    from shared.db.mssql import get_customer_profile_by_phone
    from shared.db.mssql import get_customer_by_national_id as _get_customer_by_national_id_row
except Exception:
    get_customer_profile_by_phone = None
    _get_customer_by_national_id_row = None

CUSTOMER_DB = {
    "5114881234": CustomerProfile(
        name="Abdul Rahman",
        phone="5114881234",
        email="rishabh-mittal@newgensoft.com",
        personal=PersonalDetails(
            id_number="1046403930",
            id_expiration_date="26/08/2027",
            age=35,
            gender="Male",
            dob_gr="15/05/1988",
            dob_hj="1408",
            marital_status="Married",
            nationality="KSA",
            first_name="Abdul",
            father_name="Mohammed",
            grandfather_name="Ali",
            last_name="Rahman",
            dependents="2",
            education="Graduation",
            income_type="Salaried"
        ),
        address=AddressDetails(
            line1="Villa 12, Al Malaz Residential Compound",
            line2="Near Prince Faisal Bin Fahd Stadium",
            street="Al Jamiah Street",
            city="Riyadh",
            postal_code="12836",
            house_type="Villa"
        ),
        employment=EmploymentDetails(
            type="Private Sector",
            industry="Banking & Finance",
            employer="Newgen Software",
            experience="7 years",
            work_address=AddressDetails(
                line1="Kingdom Tower, Office 1205",
                city="Riyadh",
                postal_code="12214",
            )
        ),
        income=IncomeDetails(
            monthly="SAR 35650",
            obligations="8750",
            credit_card_limit="SAR 20000"
        )
    ),
    "5114886789": CustomerProfile(
        name="Faisal Rahman",
        phone="5114886789",
        email="rishabh-mittal@newgensoft.com",
        personal=PersonalDetails(
            id_number="1046403940",
            id_expiration_date="26/08/2027",
            age=30,
            gender="Male",
            dob_gr="10/10/1993",
            dob_hj="1413",
            marital_status="",
            nationality="KSA",
            first_name="Faisal",
            father_name="Ahmed",
            grandfather_name="Omar",
            last_name="Rahman",
            dependents="",
            education="",
            income_type="Salaried"
        ),
        address=AddressDetails(
            line1="Villa 13, Al Malaz Residential Compound",
            line2="Near Prince Faisal Bin Fahd Stadium",
            street="Al Jamiah Street",
            city="Riyadh",
            postal_code="12836",
            house_type=""
        ),
        employment=EmploymentDetails(
            type="Private Sector",
            industry="Banking & Finance",
            employer="Newgen Software",
            experience="7 years",
            work_address=AddressDetails(
                line1="Kingdom Tower, Office 1205",
                city="Riyadh",
                postal_code="12214",
            )
        ),
        income=IncomeDetails(
            monthly="SAR 35650",
            obligations="8750",
            credit_card_limit="SAR 20000"
        )
    )
}


def _row_to_profile(row: dict):
    return CustomerProfile(
        name=row.get("name") or "",
        phone=row.get("phone") or "",
        email=row.get("email") or "",
        personal=PersonalDetails(
            id_number=row.get("national_id") or "",
            id_expiration_date=row.get("id_expiration_date") or "26/08/2027",
            age=row.get("age") or 0,
            gender=row.get("gender") or "",
            dob_gr=row.get("dob_gr") or "",
            dob_hj=row.get("dob_hj") or "",
            marital_status=row.get("marital_status") or "",
            nationality=row.get("nationality") or "KSA",
            first_name=row.get("first_name") or "",
            father_name=row.get("father_name") or "",
            grandfather_name=row.get("grandfather_name") or "",
            last_name=row.get("last_name") or "",
            dependents=row.get("dependents") or "",
            education=row.get("education") or "",
            income_type=row.get("income_type") or "",
        ),
        address=AddressDetails(
            line1=row.get("address_line1") or "",
            line2=row.get("address_line2") or "",
            street=row.get("street") or "",
            city=row.get("city") or "Riyadh",
            postal_code=row.get("postal_code") or "12836",
            house_type=row.get("house_type") or "Villa",
        ),
        employment=EmploymentDetails(
            type=row.get("employment_type") or "Private Sector",
            industry=row.get("industry") or "Banking & Finance",
            employer=row.get("employer") or "Newgen Software",
            experience=row.get("experience") or "7 years",
            work_address=AddressDetails(
                line1=row.get("work_address_line1") or "Kingdom Tower, Office 1205",
                city=row.get("work_city") or "Riyadh",
                postal_code=row.get("work_post_code") or "12214",
            ),
        ),
        income=IncomeDetails(
            monthly=row.get("monthly") or "SAR 35650",
            obligations=str(row.get("obligations") or "8750"),
            credit_card_limit=row.get("credit_card_limit") or "SAR 20000",
        ),
    )

def get_customer_by_phone(phone: str):
    if get_customer_profile_by_phone:
        try:
            row = get_customer_profile_by_phone(phone)
            if row:
                return _row_to_profile(row)
        except Exception:
            pass

    return CUSTOMER_DB.get(phone)


def get_customer_by_national_id(national_id: str):
    # Fast local lookup first for demo/test seeded users.
    for customer in CUSTOMER_DB.values():
        if customer.personal.id_number == national_id:
            return customer

    if _get_customer_by_national_id_row:
        try:
            row = _get_customer_by_national_id_row(national_id)
            if row:
                phone = row.get("phone") or ""
                if phone:
                    customer = get_customer_by_phone(phone)
                    if customer:
                        return customer
        except Exception:
            pass

    return None

def update_customer(national_id: str, updated_data: dict):
    """
    Updates the customer details in the primary database.
    This simulates a real database UPDATE transaction.
    """
    customer = get_customer_by_national_id(national_id)
    if not customer:
        return False
        
    # Update personal details
    if "personal" in updated_data:
        p_data = updated_data["personal"]
        customer.personal.id_expiration_date = p_data.get("idExpirationDate", customer.personal.id_expiration_date)
        customer.personal.marital_status = p_data.get("maritalStatus", customer.personal.marital_status)
        customer.personal.dependents = str(p_data.get("dependents", customer.personal.dependents))
        customer.personal.education = p_data.get("education", p_data.get("levelOfEducation", customer.personal.education))
        if p_data.get("email") is not None:
            customer.email = p_data.get("email")

    # Update address details
    if "address" in updated_data:
        if not customer.address:
            customer.address = AddressDetails()
        a_data = updated_data["address"]
        customer.address.line1 = a_data.get("line1", customer.address.line1)
        customer.address.line2 = a_data.get("line2", customer.address.line2)
        customer.address.city = a_data.get("city", customer.address.city)
        customer.address.house_type = a_data.get("houseType", a_data.get("house_type", customer.address.house_type))
        customer.address.street = a_data.get("street", customer.address.street)
        customer.address.postal_code = a_data.get("postalCode", a_data.get("postal_code", customer.address.postal_code))

    # Update employment details
    if "employment" in updated_data:
        e_data = updated_data["employment"]
        customer.employment.type = e_data.get("type", customer.employment.type)
        customer.employment.industry = e_data.get("industry", customer.employment.industry)
        customer.employment.employer = e_data.get("employer", customer.employment.employer)
        customer.employment.experience = str(e_data.get("experience", customer.employment.experience))
        # if there are work address updates:
        work_addr = e_data.get("workAddress") or e_data.get("work_address")
        if work_addr:
            if not customer.employment.work_address:
                customer.employment.work_address = AddressDetails()
            customer.employment.work_address.line1 = work_addr.get("line1", customer.employment.work_address.line1)
            customer.employment.work_address.city = work_addr.get("city", customer.employment.work_address.city)
            customer.employment.work_address.postal_code = work_addr.get("postalCode", work_addr.get("postal_code", customer.employment.work_address.postal_code))

    # Update income details
    if "income" in updated_data:
        i_data = updated_data["income"]
        customer.income.monthly = str(i_data.get("monthly", customer.income.monthly))
        customer.income.obligations = str(i_data.get("obligations", customer.income.obligations or "8750"))
        customer.income.credit_card_limit = i_data.get("creditCardLimit", i_data.get("credit_card_limit", customer.income.credit_card_limit))
        
    # In a real setup, we would execute an SQL UPDATE here:
    # e.g., execute_sql("UPDATE Customers SET ... WHERE NationalID = ?", (..., national_id))
    
    return True


# ═══════════════════════════════════════════════════════════════════
# ETB SPECIFIC FUNCTIONS (A2c: Formula-calculated + A3: IBAN Master)
# ═══════════════════════════════════════════════════════════════════

def get_etb_customer_profile(customer_id: str) -> dict:
    """
    Fetch ETB customer profile from Customer Master DB.
    Returns income, obligations, credit card limit, and tenure preferences.
    Mock data for demo; upgrade to real DB later.
    
    Args:
        customer_id: National ID of ETB customer (e.g., "1046403930")
    
    Returns:
        {
            "monthly_income": 35650,
            "monthly_obligations": 8750,
            "credit_card_limit": 20000,
            "preferred_tenure_months": 60,
        }
    """
    ETB_CUSTOMER_MASTER = {
        "1046403930": {  # Test ETB ID
            "monthly_income": 35650,
            "monthly_obligations": 8750,
            "credit_card_limit": 20000,
            "preferred_tenure_months": 60,
        },
    }
    
    return ETB_CUSTOMER_MASTER.get(customer_id, {
        "monthly_income": 30000,
        "monthly_obligations": 5000,
        "credit_card_limit": 15000,
        "preferred_tenure_months": 60,
    })


def get_etb_registered_ibans(customer_id: str) -> list:
    """
    Fetch pre-registered IBANs for ETB customer from IBAN Master table (Excel).
    Each ETB customer has pre-associated accounts on file.
    
    Args:
        customer_id: National ID of ETB customer (e.g., "1046403930")
    
    Returns:
        [
            {
                "iban": "SA0210000011100003474306",
                "bank": "National Commercial Bank",
                "beneficiary": "Abdul Rahman",
                "type": "Savings Account 1",
                "is_default": True,
            },
            ...
        ]
    """
    IBAN_MASTER_EXTENDED = {
        "1046403930": [  # Test ETB ID
            {
                "iban": "SA0210000011100003474306",
                "bank": "National Commercial Bank",
                "beneficiary": "Abdul Rahman",
                "type": "Savings Account 1",
                "is_default": True,
            },
            {
                "iban": "SA0220000003031030859941",
                "bank": "Al Rajhi Bank",
                "beneficiary": "Abdul Rahman",
                "type": "Savings Account 2",
                "is_default": False,
            },
        ],
    }
    
    return IBAN_MASTER_EXTENDED.get(customer_id, [])
