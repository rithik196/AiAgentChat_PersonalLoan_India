import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

try:
    from pymongo import MongoClient, ReturnDocument
    from pymongo.errors import PyMongoError, ServerSelectionTimeoutError
except Exception:  # pragma: no cover - lets the app fall back before pymongo is installed
    MongoClient = None
    ReturnDocument = None
    PyMongoError = Exception
    ServerSelectionTimeoutError = Exception

logger = logging.getLogger(__name__)

_client = None
_db = None
_mongo_unavailable = False
_last_failure_at = 0.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_session_id(session_id: str) -> tuple[str, str]:
    phone, _, product = (session_id or "").partition("_")
    return phone or "unknown", product or "cash_finance"


def _is_completed(session: dict[str, Any]) -> bool:
    return session.get("step") == "done" and session.get("sub_step") == "complete"


def get_db():
    global _client, _db, _mongo_unavailable, _last_failure_at
    if _mongo_unavailable or os.getenv("PERSISTENCE_BACKEND", "mongo").lower() == "json":
        if _mongo_unavailable and time.time() - _last_failure_at > 5:
            _mongo_unavailable = False
        else:
            return None
    if os.getenv("PERSISTENCE_BACKEND", "mongo").lower() == "json":
        return None
    if MongoClient is None:
        _mongo_unavailable = True
        return None
    if _db is not None:
        return _db

    mongo_url = os.getenv("MONGO_URL", "mongodb://mongodb:27017")
    database = os.getenv("MONGO_DATABASE", "aiagentchat")
    try:
        _client = MongoClient(mongo_url, serverSelectionTimeoutMS=500)
        _client.admin.command("ping")
        _db = _client[database]
        _ensure_indexes(_db)
        return _db
    except (PyMongoError, ServerSelectionTimeoutError) as exc:
        logger.warning("MongoDB persistence unavailable, falling back to JSON files: %s", exc)
        _mongo_unavailable = True
        _last_failure_at = time.time()
        return None


def _ensure_indexes(db) -> None:
    db.journey_sessions.create_index("session_id", unique=True)
    db.conversation_messages.create_index("session_id", unique=True)


def is_available() -> bool:
    return get_db() is not None


def get_session(session_id: str) -> dict[str, Any] | None:
    db = get_db()
    if db is None:
        return None
    doc = db.journey_sessions.find_one({"session_id": session_id})
    if not doc:
        return None
    return doc.get("session")


def save_session(session_id: str, session: dict[str, Any]) -> None:
    db = get_db()
    if db is None:
        return
    phone, product = _parse_session_id(session_id)
    status = "COMPLETED" if _is_completed(session) else "ACTIVE"
    now = _now()
    db.journey_sessions.update_one(
        {"session_id": session_id},
        {
            "$set": {
                "session_id": session_id,
                "phone": phone,
                "product": product,
                "customer_type": session.get("customerType") or session.get("user_type"),
                "status": status,
                "session": session,
                "updated_at": now,
                **({"completed_at": now} if status == "COMPLETED" else {}),
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )


def get_conversation(session_id: str) -> list[dict[str, Any]]:
    db = get_db()
    if db is None:
        return []
    doc = db.conversation_messages.find_one({"session_id": session_id})
    if not doc:
        return []
    return doc.get("messages", [])


def append_messages(session_id: str, messages: list[dict[str, Any]]) -> None:
    if not messages:
        return
    db = get_db()
    if db is None:
        return

    now_ts = time.time()
    normalized: list[dict[str, Any]] = []
    for msg in messages:
        normalized.append(
            {
                "role": msg.get("role", "user"),
                "content": msg.get("content", ""),
                "timestamp": msg.get("timestamp", now_ts),
                **({"widget": msg.get("widget")} if msg.get("widget") else {}),
                **({"metadata": msg.get("metadata")} if msg.get("metadata") else {}),
            }
        )

    doc = db.conversation_messages.find_one_and_update(
        {"session_id": session_id},
        {
            "$setOnInsert": {
                "session_id": session_id,
                "messages": [],
                "created_at": _now(),
            }
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    existing = doc.get("messages", []) if doc else []
    for msg in normalized:
        if (
            existing
            and existing[-1].get("role") == msg.get("role")
            and existing[-1].get("content") == msg.get("content")
        ):
            if msg.get("widget") and not existing[-1].get("widget"):
                existing[-1]["widget"] = msg["widget"]
            if msg.get("metadata"):
                existing[-1]["metadata"] = {**existing[-1].get("metadata", {}), **msg["metadata"]}
            continue
        existing.append(msg)

    db.conversation_messages.update_one(
        {"session_id": session_id},
        {"$set": {"messages": existing, "updated_at": _now()}},
    )


def save_full_conversation(session_id: str, messages: list[dict[str, Any]]) -> None:
    db = get_db()
    if db is None:
        return
    db.conversation_messages.update_one(
        {"session_id": session_id},
        {
            "$set": {
                "session_id": session_id,
                "messages": messages,
                "updated_at": _now(),
            },
            "$setOnInsert": {"created_at": _now()},
        },
        upsert=True,
    )


def delete_journey(session_id: str) -> None:
    db = get_db()
    if db is None:
        return
    db.journey_sessions.delete_one({"session_id": session_id})
    db.conversation_messages.delete_one({"session_id": session_id})


def get_status(session_id: str) -> str | None:
    db = get_db()
    if db is None:
        return None
    doc = db.journey_sessions.find_one({"session_id": session_id}, {"status": 1})
    return doc.get("status") if doc else None
