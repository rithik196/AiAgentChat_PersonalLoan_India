import asyncio
import logging
import os
from temporalio.client import Client
from temporalio.worker import Worker
from dotenv import load_dotenv

from workflow.workflows.rlos_workflow import RLOSWorkflow
from workflow.activities.mock_activities import (
    mock_nafath_push,
    mock_simah_pull,
    mock_docusign_send,
    mock_core_banking_transfer
)

load_dotenv()
logging.basicConfig(level=logging.INFO)

async def main():
    temporal_address = os.getenv("TEMPORAL_ADDRESS", "localhost:7233")
    client = await Client.connect(temporal_address)
    logging.info("Connected to Temporal cluster at %s", temporal_address)

    # Run the worker
    worker = Worker(
        client,
        task_queue="rlos-queue",
        workflows=[RLOSWorkflow],
        activities=[
            mock_nafath_push,
            mock_simah_pull,
            mock_docusign_send,
            mock_core_banking_transfer
        ],
    )
    logging.info("Starting Temporal Worker on task queue 'rlos-queue'...")
    await worker.run()

if __name__ == "__main__":
    asyncio.run(main())
