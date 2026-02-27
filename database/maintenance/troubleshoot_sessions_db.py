"""
troubleshoot_sessions_db - DynamoDB storage for troubleshooting conversation sessions.

Table: urbangroup-troubleshoot-sessions-{stage}
  PK: phone (String)
  TTL: expires_at (Number, epoch seconds)
"""

import os
import json
import logging
import time
from datetime import datetime
from decimal import Decimal

import boto3

logger = logging.getLogger("urbangroup.troubleshoot_sessions_db")

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))

TABLE_NAME = os.environ.get("TROUBLESHOOT_SESSIONS_TABLE", "urbangroup-troubleshoot-sessions-prod")
_table = _dynamodb.Table(TABLE_NAME)

# Fields that contain nested JSON objects/arrays
_JSON_FIELDS = ("llm_result", "parsed_data", "skipped_steps", "session_log")


def save_session(session_data):
    """Save a new troubleshooting session. Overwrites any existing session for this phone."""
    item = _prepare_item(session_data)
    _table.put_item(Item=item)
    logger.info(f"Session saved for {session_data['phone']}, step={session_data['step']}")


def get_session(phone):
    """Get the active session for a phone number. Returns dict or None."""
    resp = _table.get_item(Key={"phone": phone})
    item = resp.get("Item")
    if item:
        return _deserialize_item(item)
    return None


def update_session(phone, session_data):
    """Update session data (step, collected fields, etc.)."""
    item = _prepare_item(session_data)
    _table.put_item(Item=item)
    logger.info(f"Session updated for {phone}, step={session_data.get('step')}")


def update_session_step(phone, new_step):
    """Quick update just the step field."""
    _table.update_item(
        Key={"phone": phone},
        UpdateExpression="SET step = :s, updated_at = :now",
        ExpressionAttributeValues={
            ":s": new_step,
            ":now": datetime.utcnow().isoformat() + "Z",
        },
    )


def delete_session(phone):
    """Delete a session (used on cancel)."""
    _table.delete_item(Key={"phone": phone})
    logger.info(f"Session deleted for {phone}")


def list_sessions(limit=50):
    """List recent sessions (scan). Returns list sorted by created_at descending."""
    resp = _table.scan()
    items = resp.get("Items", [])
    sessions = [_deserialize_item(item) for item in items]
    sessions.sort(key=lambda s: s.get("created_at", ""), reverse=True)
    return sessions[:limit]


def extend_session_ttl(phone, days=7):
    """Extend the session TTL (e.g. after completion so log stays visible)."""
    new_ttl = int(time.time()) + days * 86400
    _table.update_item(
        Key={"phone": phone},
        UpdateExpression="SET expires_at = :ttl",
        ExpressionAttributeValues={":ttl": new_ttl},
    )


def _prepare_item(data):
    """Convert Python types to DynamoDB-safe format."""
    item = {}
    for k, v in data.items():
        if isinstance(v, (dict, list)):
            item[k] = json.dumps(v, ensure_ascii=False)
        elif isinstance(v, bool):
            item[k] = v
        elif isinstance(v, float):
            item[k] = Decimal(str(v))
        elif isinstance(v, int):
            item[k] = v
        else:
            item[k] = v
    return item


def _deserialize_item(item):
    """Deserialize DynamoDB item back to Python types."""
    data = {}
    for k, v in item.items():
        if isinstance(v, str) and k in _JSON_FIELDS:
            try:
                data[k] = json.loads(v)
            except (json.JSONDecodeError, TypeError):
                data[k] = v
        elif isinstance(v, Decimal):
            data[k] = int(v) if v == int(v) else float(v)
        else:
            data[k] = v
    return data
