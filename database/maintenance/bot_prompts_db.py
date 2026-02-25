"""
bot_prompts_db - DynamoDB storage for LLM system prompts.

Table: urbangroup-bot-prompts-{stage}
  PK: prompt_id (String)

Stores the system prompts used by MLLM1000 to analyze WhatsApp messages.
Operators can edit prompts from the website to "train" the bot.
"""

import os
import json
import time
import logging
from datetime import datetime
from decimal import Decimal

import boto3

logger = logging.getLogger("urbangroup.bot_prompts_db")

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))

TABLE_NAME = os.environ.get("BOT_PROMPTS_TABLE", "urbangroup-bot-prompts-prod")
_table = _dynamodb.Table(TABLE_NAME)

# In-memory cache for active prompt
_cache = {}
CACHE_TTL_SECONDS = 300  # 5 minutes


def get_active_prompt(use_cache=True):
    """Get the currently active LLM prompt.

    Args:
        use_cache: Whether to use in-memory cache (default True)

    Returns:
        dict with prompt data, or None if no active prompt
    """
    if use_cache:
        cached = _cache.get("active")
        if cached and (time.time() - cached["fetched_at"]) < CACHE_TTL_SECONDS:
            return cached["data"]

    resp = _table.scan(
        FilterExpression="active = :val",
        ExpressionAttributeValues={":val": True},
    )
    items = resp.get("Items", [])
    if items:
        data = _deserialize_item(items[0])
        _cache["active"] = {"data": data, "fetched_at": time.time()}
        return data
    return None


def get_prompt(prompt_id, use_cache=True):
    """Get a prompt by ID.

    Args:
        prompt_id: The prompt identifier
        use_cache: Whether to use in-memory cache (default True)

    Returns:
        dict with prompt data, or None if not found
    """
    if use_cache:
        cached = _cache.get(prompt_id)
        if cached and (time.time() - cached["fetched_at"]) < CACHE_TTL_SECONDS:
            return cached["data"]

    resp = _table.get_item(Key={"prompt_id": prompt_id})
    item = resp.get("Item")
    if item:
        data = _deserialize_item(item)
        _cache[prompt_id] = {"data": data, "fetched_at": time.time()}
        return data
    return None


def save_prompt(prompt_data):
    """Save or update a prompt.

    Args:
        prompt_data: dict with prompt_id and all prompt fields

    Returns:
        dict with saved prompt_id
    """
    now = datetime.utcnow().isoformat() + "Z"
    prompt_data["updated_at"] = now
    if not prompt_data.get("created_at"):
        prompt_data["created_at"] = now

    item = _prepare_item(prompt_data)
    _table.put_item(Item=item)

    # Invalidate cache
    pid = prompt_data["prompt_id"]
    _cache.pop(pid, None)
    _cache.pop("active", None)

    logger.info(f"Prompt saved: {pid}")
    return {"prompt_id": pid}


def list_prompts():
    """List all prompts.

    Returns:
        list of prompt dicts
    """
    resp = _table.scan()
    items = resp.get("Items", [])
    return [_deserialize_item(item) for item in items]


def invalidate_cache(prompt_id=None):
    """Clear cached prompt(s).

    Args:
        prompt_id: Specific prompt to invalidate, or None to clear all
    """
    if prompt_id:
        _cache.pop(prompt_id, None)
        _cache.pop("active", None)
    else:
        _cache.clear()


def _prepare_item(data):
    """Convert Python types to DynamoDB-safe format."""
    item = {}
    for k, v in data.items():
        if isinstance(v, bool):
            item[k] = v
        elif isinstance(v, (dict, list)):
            item[k] = json.dumps(v, ensure_ascii=False)
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
        if isinstance(v, Decimal):
            data[k] = int(v) if v == int(v) else float(v)
        else:
            data[k] = v
    return data
