# shared/models/signals.py

from pydantic import BaseModel
from typing import Dict, Any, Optional

class SignalPayload(BaseModel):
    data: Optional[Dict[str, Any]] = None
    reason: Optional[str] = None
