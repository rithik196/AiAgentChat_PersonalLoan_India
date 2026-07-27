import os
import sys
# Add project root to sys.path to allow shared module imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from api.chat import router as chat_router
from api.auth import router as auth_router
from api.profile import router as profile_router

app = FastAPI(title="RLOS API Gateway", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(chat_router, prefix="/api")
app.include_router(auth_router, prefix="/api/auth")
app.include_router(profile_router, prefix="/api/customer")

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
