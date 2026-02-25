"""
knowledge_db - DynamoDB storage for bot knowledge base items.

Table: urbangroup-knowledge-{stage}
  PK: id (String, UUID)

Stores knowledge items with OpenAI embeddings for RAG retrieval.
Sources: manual entries, operator feedback on conversations, documents.
"""

import os
import json
import uuid
import time
import logging
from datetime import datetime
from decimal import Decimal

import boto3

logger = logging.getLogger("urbangroup.knowledge_db")

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))

TABLE_NAME = os.environ.get("KNOWLEDGE_TABLE", "urbangroup-knowledge-prod")
_table = _dynamodb.Table(TABLE_NAME)

# Cache for all active items with embeddings (for similarity search)
_embeddings_cache = {"data": None, "fetched_at": 0}
CACHE_TTL_SECONDS = 300  # 5 minutes


def save_item(data):
    """Save or update a knowledge item.

    Args:
        data: dict with knowledge item fields.
              Required: title, content
              Optional: type, tags, embedding, source_call_id, active

    Returns:
        dict with saved item id
    """
    now = datetime.utcnow().isoformat() + "Z"

    if not data.get("id"):
        data["id"] = str(uuid.uuid4())
    data["updated_at"] = now
    if not data.get("created_at"):
        data["created_at"] = now
    if "active" not in data:
        data["active"] = True

    item = _prepare_item(data)
    _table.put_item(Item=item)

    # Invalidate cache
    _embeddings_cache["data"] = None

    logger.info(f"Knowledge item saved: {data['id']} ({data.get('title', '?')})")
    return {"id": data["id"]}


def get_item(item_id):
    """Get a single knowledge item by ID.

    Returns:
        dict with item data, or None if not found
    """
    resp = _table.get_item(Key={"id": item_id})
    item = resp.get("Item")
    return _deserialize_item(item) if item else None


def list_items(item_type=None):
    """List all active knowledge items.

    Args:
        item_type: Optional filter by type (manual, feedback, document)

    Returns:
        list of item dicts (without embeddings for efficiency)
    """
    resp = _table.scan()
    items = resp.get("Items", [])
    result = []
    for item in items:
        data = _deserialize_item(item)
        if not data.get("active", True):
            continue
        if item_type and data.get("type") != item_type:
            continue
        # Strip embedding from list results (too large)
        data.pop("embedding", None)
        result.append(data)
    result.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return result


def delete_item(item_id):
    """Soft-delete a knowledge item (set active=false).

    Args:
        item_id: The item UUID
    """
    _table.update_item(
        Key={"id": item_id},
        UpdateExpression="SET active = :val, updated_at = :now",
        ExpressionAttributeValues={
            ":val": False,
            ":now": datetime.utcnow().isoformat() + "Z",
        },
    )
    _embeddings_cache["data"] = None
    logger.info(f"Knowledge item deactivated: {item_id}")


def get_all_active_with_embeddings(use_cache=True):
    """Get all active items with their embeddings for similarity search.

    Returns:
        list of dicts with id, title, content, embedding, tags
    """
    if use_cache and _embeddings_cache["data"] is not None:
        if (time.time() - _embeddings_cache["fetched_at"]) < CACHE_TTL_SECONDS:
            return _embeddings_cache["data"]

    resp = _table.scan()
    items = resp.get("Items", [])
    result = []
    for item in items:
        data = _deserialize_item(item)
        if not data.get("active", True):
            continue
        if not data.get("embedding"):
            continue
        result.append({
            "id": data["id"],
            "title": data.get("title", ""),
            "content": data.get("content", ""),
            "embedding": data["embedding"],
            "tags": data.get("tags", []),
            "type": data.get("type", "manual"),
        })

    _embeddings_cache["data"] = result
    _embeddings_cache["fetched_at"] = time.time()
    logger.info(f"Loaded {len(result)} knowledge items with embeddings")
    return result


def invalidate_cache():
    """Clear the embeddings cache."""
    _embeddings_cache["data"] = None


def _prepare_item(data):
    """Convert Python types to DynamoDB-safe format."""
    item = {}
    for k, v in data.items():
        if isinstance(v, bool):
            item[k] = v
        elif isinstance(v, list) and k == "embedding":
            # Store embedding as JSON string (list of floats)
            item[k] = json.dumps(v)
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
    _JSON_FIELDS = ("tags",)
    data = {}
    for k, v in item.items():
        if k == "embedding" and isinstance(v, str):
            try:
                data[k] = json.loads(v)
            except (json.JSONDecodeError, TypeError):
                data[k] = None
        elif isinstance(v, str) and k in _JSON_FIELDS:
            try:
                data[k] = json.loads(v)
            except (json.JSONDecodeError, TypeError):
                data[k] = v
        elif isinstance(v, Decimal):
            data[k] = int(v) if v == int(v) else float(v)
        else:
            data[k] = v
    return data
