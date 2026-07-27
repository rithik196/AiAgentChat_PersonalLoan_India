from typing import TypedDict, List, Dict, Any, Optional

class ConversationState(TypedDict):
    messages: List[Dict[str, Any]]
    session: Dict[str, Any]
    last_response: str
    extract: Optional[Dict[str, Any]]
    intent: Optional[str]          # classify node output: STEP_DATA | GENERAL_QUERY | ESCALATE
    classified_data: Optional[Dict[str, Any]]  # structured data from classify node
    wants_more: Optional[bool]  # ETB pre-approved offer 'need higher amount' flag
