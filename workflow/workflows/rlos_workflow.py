from temporalio import workflow
import asyncio
from datetime import timedelta

with workflow.unsafe.imports_passed_through():
    from shared.models.journey import LoanInput
    from workflow.activities.mock_activities import (
        mock_nafath_push,
        mock_simah_pull,
        mock_docusign_send,
        mock_core_banking_transfer
    )

@workflow.defn
class RLOSWorkflow:
    def __init__(self) -> None:
        self.state = "STARTED"
        self.identity_data = None
        self.identity_verified_data = None
        self.offer_data = None
        self.trade_data = None
        self.esign_data = None
        self.disburse_data = None
        self.escalated = False
        self.escalation_reason = ""

    @workflow.signal
    def identity_verified(self, data: dict) -> None:
        self.state = "IDENTITY_VERIFIED"
        self.identity_verified_data = data

    @workflow.signal
    def identity_received(self, data: dict) -> None:
        self.identity_data = data

    @workflow.signal
    def offer_selected(self, data: dict) -> None:
        self.offer_data = data

    @workflow.signal
    def trade_confirmed(self, data: dict) -> None:
        self.trade_data = data

    @workflow.signal
    def esign_completed(self, data: dict) -> None:
        self.esign_data = data

    @workflow.signal
    def disburse_confirmed(self, data: dict) -> None:
        self.disburse_data = data

    @workflow.signal
    def escalate_to_human(self, data: dict) -> None:
        self.escalated = True
        self.escalation_reason = data.get("reason", "Customer request")

    @workflow.run
    async def run(self, input: LoanInput) -> dict:
        workflow.logger.info(f"Starting RLOSWorkflow for customer: {input.customer_id}")

        # STEP 1: IDENTITY
        self.state = "AWAITING_IDENTITY"
        await workflow.wait_condition(lambda: self.identity_data is not None or self.escalated)
        if self.escalated: return {"status": "ESCALATED", "reason": self.escalation_reason}
        
        # Execute Identity Activity (Mock Nafath)
        nafath_result = await workflow.execute_activity(
            mock_nafath_push,
            self.identity_data.get("id_number"),
            start_to_close_timeout=timedelta(minutes=2)
        )
        workflow.logger.info(f"Nafath Result: {nafath_result}")

        # Wait for user to verify NAFAth via UI
        await workflow.wait_condition(lambda: self.identity_verified_data is not None or self.escalated)
        if self.escalated: return {"status": "ESCALATED", "reason": self.escalation_reason}

        # Deduplication Simulation
        is_etb = str(self.identity_data.get("id_number")).startswith("1")
        if is_etb:
            self.state = "ETB_PRE_APPROVED_OFFER"
            workflow.logger.info("Executing ETB Dedupe Logic -> Routing to Pre-Approved Offer")
        else:
            self.state = "NTB_DATA_ENRICHMENT"
            workflow.logger.info("Executing NTB Dedupe Logic -> Routing to Data Enrichment (Profile, Address, Employment, Income)")
            # NTB Enrichment mock wait (Handled by UI signals, but here we just pass through to offer)
            self.state = "AWAITING_EXPENSE_AND_BUREAU"

        # Pre-fetch bureau data before presenting offer
        bureau_result = await workflow.execute_activity(
            mock_simah_pull,
            self.identity_data.get("id_number"),
            start_to_close_timeout=timedelta(minutes=2)
        )
        workflow.logger.info(f"Bureau Result for Regulatory / Eligibility: {bureau_result}")

        # STEP 2: OFFER
        self.state = "AWAITING_OFFER"
        await workflow.wait_condition(lambda: self.offer_data is not None or self.escalated)
        if self.escalated: return {"status": "ESCALATED", "reason": self.escalation_reason}

        # STEP 3: TRADE (Commodity Transaction)
        self.state = "AWAITING_TRADE"
        await workflow.wait_condition(lambda: self.trade_data is not None or self.escalated)
        if self.escalated: return {"status": "ESCALATED", "reason": self.escalation_reason}

        # STEP 4: E-SIGN
        self.state = "AWAITING_ESIGN"
        # Send DocuSign
        esign_result = await workflow.execute_activity(
            mock_docusign_send,
            {"customer_id": input.customer_id, "amount": self.offer_data.get("loan_amount")},
            start_to_close_timeout=timedelta(minutes=2)
        )
        workflow.logger.info(f"eSign Contract & Promissory Note Result: {esign_result}")

        await workflow.wait_condition(lambda: self.esign_data is not None or self.escalated)
        if self.escalated: return {"status": "ESCALATED", "reason": self.escalation_reason}

        # STEP 5: DISBURSE (Including IVR confirmation conceptual step before core banking)
        self.state = "AWAITING_DISBURSE"
        await workflow.wait_condition(lambda: self.disburse_data is not None or self.escalated)
        if self.escalated: return {"status": "ESCALATED", "reason": self.escalation_reason}

        disburse_result = await workflow.execute_activity(
            mock_core_banking_transfer,
            args=[self.disburse_data.get("account_number", "SA123456789"), self.offer_data.get("loan_amount")],
            start_to_close_timeout=timedelta(minutes=2)
        )
        workflow.logger.info(f"Disburse Result: {disburse_result}")

        self.state = "COMPLETED"
        return {"status": "COMPLETED", "transaction": disburse_result}
