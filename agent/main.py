import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from graph.graph import agent_app
from graph.nodes import _chat, RESPOND_MODEL
from knowledge.faq_engine import answer_general_query, retrieve_general_query_context
from shared.journey_fallback import compose_fallback_response
from persistence import get_session, save_session, append_messages, get_conversation, delete_journey

app = FastAPI(title="RLOS LangGraph Agent")

# In-memory cache backed by file persistence
SESSION_CACHE: dict[str, dict] = {}

class InvokeRequest(BaseModel):
    session_id: str = "default_session"
    messages: List[Dict[str, Any]]
    session: Dict[str, Any]

class InvokeResponse(BaseModel):
    response: str
    session: Dict[str, Any]
    extract: Optional[Dict[str, Any]] = None

class ConversationResponse(BaseModel):
    messages: List[Dict[str, Any]]
    session: Optional[Dict[str, Any]] = None

class QuestionRequest(BaseModel):
    session_id: str = "default_session"
    message: str
    session: Dict[str, Any]

class QuestionResponse(BaseModel):
    response: str
    domain: Optional[str] = None
    confidence: Optional[float] = None

@app.get("/conversation/{session_id}", response_model=ConversationResponse)
async def get_conversation_history(session_id: str):
    """Return saved conversation + session for a given session ID."""
    messages = get_conversation(session_id)
    session = get_session(session_id)
    return ConversationResponse(messages=messages, session=session)

@app.delete("/conversation/{session_id}")
async def delete_conversation_history(session_id: str):
    """Delete a completed journey so the customer can start a new one."""
    SESSION_CACHE.pop(session_id, None)
    delete_journey(session_id)
    return {"deleted": True}

@app.post("/invoke", response_model=InvokeResponse)
async def invoke_agent(req: InvokeRequest):
    try:
        defaults = {
            "region": "SA",
            "step": "identity",
            "sub_step": "awaiting_id",
            "step_number": 1,
            "total_steps": 5,
            "product": "cash_finance",
            "user_type": "unknown",
            "customerType": "UNKNOWN",
            "journeyMode": "PRE_DEDUPE",
            "journeyOrigin": "UNKNOWN",
            "transitionReason": None,
            "collected": {},
            "offer": {},
            "finance_summary": {},
            "disbursement": {},
            "failed_attempts": 0,
        }
        persisted = get_session(req.session_id) or {}
        cached = SESSION_CACHE.get(req.session_id) or {}
        incoming = dict(req.session or {})

        # The API gateway is the live source of truth for the current widget state.
        # Always let the incoming session override stale agent cache/persistence.
        current_session = {**defaults, **persisted, **cached, **incoming}

        # Cache it
        SESSION_CACHE[req.session_id] = current_session

        state = {
            "messages": req.messages,
            "session": current_session,
            "last_response": "",
            "extract": None
        }
        
        result = await agent_app.ainvoke(state)
        
        # Save updated session to cache + file
        SESSION_CACHE[req.session_id] = result["session"]
        save_session(req.session_id, result["session"])

        # Internal routing signals — never stored in history so LLM cannot read them
        _ROUTING_SIGNALS = {
            "nafath approved", "loading_complete", "loading complete",
            "continue", "dedupe_complete", "dedupe complete",
            "identity_complete", "verification_loading", "done",
            "accepted_max_offer", "higher_amount_requested",
            "submit_higher_amount_review", "higher_amount_review_go_back",
        }

        # Save conversation: user message + assistant response
        # Skip internal routing signals so they never pollute the LLM context
        last_user = req.messages[-1] if req.messages else None
        new_msgs = []
        if last_user and last_user.get("role") == "user":
            content = last_user.get("content", "")
            if content.lower().strip() not in _ROUTING_SIGNALS:
                new_msgs.append({"role": "user", "content": content})
        assistant_content = (result.get("last_response") or "").strip()
        if assistant_content:
            new_msgs.append({"role": "assistant", "content": assistant_content})
        append_messages(req.session_id, new_msgs)
        
        return InvokeResponse(
            response=result["last_response"],
            session=result["session"],
            extract=result.get("extract")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/answer_question", response_model=QuestionResponse)
async def answer_question(req: QuestionRequest):
    """Answer a journey question without invoking routing or mutating session state."""
    try:
        session = dict(req.session or {})
        retrieved = retrieve_general_query_context(req.message, session, limit=4)
        matches = retrieved.get("matches", [])
        is_casual_voice_chat = not matches and not retrieved.get("is_banking_context")

        knowledge_lines = []
        for match in matches:
            knowledge_lines.append(
                f"- Domain: {match.get('id')} | Score: {match.get('score')}\n"
                f"  Guidance: {match.get('response')}"
            )

        prompt = [
            {
                "role": "system",
                "content": (
                    "You are answering a customer's question during a Cash Finance digital journey. "
                    "Answer both banking questions and harmless casual voice-mode conversation naturally and warmly. "
                    "If the customer greets you, asks how you are, or makes small talk, respond like Raya as a friendly human assistant. "
                    "If the message is banking/journey related, answer it using the supplied knowledge and session context. "
                    "Do not advance, reset, or change the journey. Do not ask the customer to proceed unless the question explicitly asks for the next action. "
                    "If the knowledge is insufficient for a banking question, give a concise safe answer and say the bank will confirm final policy during verification. "
                    "Keep the answer short, clear, and specific to the user's question."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Customer question: {req.message}\n\n"
                    f"Current journey state: step={session.get('step')}, sub_step={session.get('sub_step')}, "
                    f"customerType={session.get('customerType')}, journeyMode={session.get('journeyMode')}\n"
                    f"Current offer: {session.get('offer', {})}\n"
                    f"Finance summary: {session.get('finance_summary', {})}\n"
                    f"Selected account: {session.get('selected_account', {})}\n\n"
                    "Relevant knowledge:\n"
                    + ("\n".join(knowledge_lines) if knowledge_lines else "- No exact template matched; answer from general Cash Finance context only.")
                ),
            },
        ]

        response_text = (await _chat(RESPOND_MODEL, prompt, temperature=0.2)).strip()
        if not response_text:
            fallback = answer_general_query(req.message, session)
            response_text = fallback["text"] if fallback else "I can answer questions about your Cash Finance journey while keeping your application at the same step."
        if not is_casual_voice_chat:
            response_text = compose_fallback_response(response_text, session)

        top = matches[0] if matches else {}
        return QuestionResponse(
            response=response_text,
            domain=top.get("id"),
            confidence=top.get("score"),
        )
    except Exception:
        fallback = answer_general_query(req.message, req.session or {})
        if fallback:
            return QuestionResponse(
                response=compose_fallback_response(fallback["text"], req.session or {}),
                domain=fallback.get("domain"),
                confidence=fallback.get("score"),
            )
        raise

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
