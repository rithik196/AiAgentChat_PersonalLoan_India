from temporalio import activity
import asyncio

@activity.defn
async def mock_nafath_push(id_number: str) -> dict:
    activity.logger.info(f"Mocking Nafath Push for ID: {id_number}")
    await asyncio.sleep(2)  # Simulate API latency
    return {"status": "SUCCESS", "verification_id": "nafath-123"}

@activity.defn
async def mock_simah_pull(id_number: str) -> dict:
    activity.logger.info(f"Mocking SIMAH Pull for ID: {id_number}")
    await asyncio.sleep(1)
    return {"score": 750, "max_eligible_amount": 250000, "status": "CLEAN"}

@activity.defn
async def mock_docusign_send(contract_details: dict) -> dict:
    activity.logger.info(f"Mocking DocuSign send for: {contract_details}")
    await asyncio.sleep(1)
    return {"status": "SENT", "envelope_id": "env-888"}

@activity.defn
async def mock_core_banking_transfer(account: str, amount: float) -> dict:
    activity.logger.info(f"Mocking Core Banking Transfer of {amount} to {account}")
    await asyncio.sleep(2)
    return {"status": "SUCCESS", "transaction_ref": "TXN-999"}
