-- Seed Data for Phase 1: ETB and NTB Customers
-- Run this script in the MSSQL `sacom` database

-- 1. Insert Customers
INSERT INTO customers (name, phone, national_id, email, created_at)
VALUES 
    ('Abdul Rahman', '5114881234', '1046403930', 'rishabh-mittal@newgensoft.com', GETDATE()),
    ('Faisal Rahman', '5114886789', '1046403940', 'rishabh-mittal@newgensoft.com', GETDATE());

-- 2. Declare variables for IDs (assuming identity columns)
DECLARE @AbdulID INT = (SELECT id FROM customers WHERE phone = '5114881234');
DECLARE @FaisalID INT = (SELECT id FROM customers WHERE phone = '5114886789');

-- 3. Insert Personal Details
INSERT INTO personal_details (customer_id, age, gender, dob_gr, dob_hj, address, marital_status, nationality, father_name, grandfather_name, dependents, income_type)
VALUES
    (@AbdulID, 35, 'Male', '15/05/1988', '1408', 'Villa 12, Al Malaz Residential Compound, Near Prince Faisal Bin Fahd Stadium, Al Jamiah Street', 'Married', 'Saudi', 'Mohammed', 'Ali', '3', 'Salaried'),
    (@FaisalID, 30, 'Male', '10/10/1993', '1413', 'Villa 13, Al Malaz Residential Compound, Near Prince Faisal Bin Fahd Stadium, Al Jamiah Street', 'Single', 'Saudi', 'Ahmed', 'Omar', '0', 'Salaried');

-- 4. Insert Employment Details
INSERT INTO employment_details (customer_id, type, industry, employer, experience, address)
VALUES
    (@AbdulID, 'Salaried', 'Software', 'Newgen Software', '5', 'Kingdom Tower, Office 1205, Riyadh, 12214'),
    (@FaisalID, 'Salaried', 'Software', 'Newgen Software', '3', 'Kingdom Tower, Office 1205, Riyadh, 12214');

-- 5. Insert Income Details
INSERT INTO income_details (customer_id, monthly)
VALUES
    (@AbdulID, 'SAR 25,000'),
    (@FaisalID, 'SAR 20,000');
