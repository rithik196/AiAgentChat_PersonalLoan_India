import asyncio
import logging
from temporalio.client import Client
from shared.models.journey import LoanInput
from shared.constants.products import Product
from shared.constants.regions import Region

logging.basicConfig(level=logging.INFO)

async def start_demo_workflow():
    try:
        client = await Client.connect("localhost:7233")
        logging.info("Connected to Temporal cluster.")

        inp = LoanInput(
            customer_id="demo_user_1",
            region=Region.SA,
            product=Product.CASH_FINANCE
        )

        # Start the workflow
        handle = await client.start_workflow(
            "RLOSWorkflow",
            inp,
            id="demo-workflow-1",
            task_queue="rlos-queue",
        )

        logging.info(f"Started workflow. Workflow ID: {handle.id}, Run ID: {handle.result_run_id}")
        logging.info("You can now test sending messages via the Next.js chat interface!")

    except Exception as e:
        logging.error(f"Failed to start workflow: {e}")

if __name__ == "__main__":
    asyncio.run(start_demo_workflow())
