"""
bot_scripts_db - DynamoDB storage for bot conversation scripts.

Table: urbangroup-bot-scripts-{stage}
  PK: script_id (String)

Scripts define conversation flows as JSON: steps, buttons, text templates,
skip conditions, and done actions. The M10010 bot engine reads these at runtime.
"""

import os
import json
import time
import logging
from datetime import datetime
from decimal import Decimal

import boto3

logger = logging.getLogger("urbangroup.bot_scripts_db")

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))

TABLE_NAME = os.environ.get("BOT_SCRIPTS_TABLE", "urbangroup-bot-scripts-prod")
_table = _dynamodb.Table(TABLE_NAME)

# In-memory cache: {script_id: {"data": {...}, "fetched_at": timestamp}}
_cache = {}
CACHE_TTL_SECONDS = 300  # 5 minutes


# Fields that contain nested JSON objects/arrays
_JSON_FIELDS = ("steps", "done_actions", "_flow_positions")


def get_script(script_id, use_cache=True):
    """Get a bot script by ID.

    Args:
        script_id: The script identifier (e.g. "maintenance-troubleshoot")
        use_cache: Whether to use in-memory cache (default True)

    Returns:
        dict with script data, or None if not found
    """
    if use_cache:
        cached = _cache.get(script_id)
        if cached and (time.time() - cached["fetched_at"]) < CACHE_TTL_SECONDS:
            return cached["data"]

    resp = _table.get_item(Key={"script_id": script_id})
    item = resp.get("Item")
    if item:
        data = _deserialize_item(item)
        _cache[script_id] = {"data": data, "fetched_at": time.time()}
        return data
    return None


def save_script(script_data):
    """Save or update a bot script.

    Args:
        script_data: dict with script_id and all script fields

    Returns:
        dict with saved script_id
    """
    now = datetime.utcnow().isoformat() + "Z"
    script_data["updated_at"] = now
    if not script_data.get("created_at"):
        script_data["created_at"] = now

    item = _prepare_item(script_data)
    _table.put_item(Item=item)

    # Invalidate cache
    sid = script_data["script_id"]
    _cache.pop(sid, None)

    logger.info(f"Script saved: {sid}")
    return {"script_id": sid}


def list_scripts():
    """List all bot scripts.

    Returns:
        list of script dicts
    """
    resp = _table.scan()
    items = resp.get("Items", [])
    return [_deserialize_item(item) for item in items]


def delete_script(script_id):
    """Delete a bot script.

    Args:
        script_id: The script identifier
    """
    _table.delete_item(Key={"script_id": script_id})
    _cache.pop(script_id, None)
    logger.info(f"Script deleted: {script_id}")


def invalidate_cache(script_id=None):
    """Clear cached script(s).

    Args:
        script_id: Specific script to invalidate, or None to clear all
    """
    if script_id:
        _cache.pop(script_id, None)
    else:
        _cache.clear()


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
