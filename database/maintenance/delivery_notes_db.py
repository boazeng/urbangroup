"""
delivery_notes_db - DynamoDB storage for delivery notes (תעודות משלוח).

Table: urbangroup-delivery-notes-{stage}
  PK: id (String, UUID)
  GSI: status-created_at-index (status → created_at)

Each delivery note has a header + line items stored as JSON.
Status flow: draft → sent → error
"""

import os
import json
import uuid
import logging
from datetime import datetime
from decimal import Decimal

import boto3

logger = logging.getLogger("urbangroup.delivery_notes_db")

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))
TABLE_NAME = os.environ.get("DELIVERY_NOTES_TABLE", "urbangroup-delivery-notes-prod")
_table = _dynamodb.Table(TABLE_NAME)


def save_delivery_note(customer_num, customer_name, site_name, details, items):
    """Save a new delivery note (draft).

    Args:
        customer_num: Priority customer number (e.g. "50254")
        customer_name: Customer display name
        site_name: Site name
        details: Free text (e.g. "אתר X - 2.26")
        items: List of line items [{partname, pdes, tquant, price}]

    Returns:
        dict with saved note id
    """
    now = datetime.utcnow().isoformat() + "Z"
    note_id = str(uuid.uuid4())

    item = _prepare_item({
        "id": note_id,
        "customer_num": customer_num,
        "customer_name": customer_name,
        "site_name": site_name,
        "details": details,
        "items": items,
        "status": "draft",
        "docno": "",
        "error": "",
        "created_at": now,
        "updated_at": now,
    })

    _table.put_item(Item=item)
    logger.info(f"Saved delivery note {note_id} for customer {customer_num}")
    return {"id": note_id}


def get_delivery_note(note_id):
    """Get a single delivery note by ID."""
    resp = _table.get_item(Key={"id": note_id})
    item = resp.get("Item")
    return _deserialize_item(item) if item else None


def list_delivery_notes(status=None, limit=100):
    """List delivery notes, optionally filtered by status."""
    if status:
        resp = _table.query(
            IndexName="status-created_at-index",
            KeyConditionExpression="#s = :status",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":status": status},
            ScanIndexForward=False,
            Limit=limit,
        )
    else:
        resp = _table.scan(Limit=limit)

    items = resp.get("Items", [])
    result = [_deserialize_item(i) for i in items]
    if not status:
        result.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return result


def update_delivery_note(note_id, updates):
    """Update fields on a delivery note.

    Args:
        note_id: The note ID
        updates: dict of fields to update (e.g. {status, docno, items, details})
    """
    now = datetime.utcnow().isoformat() + "Z"
    updates["updated_at"] = now

    expr_parts = []
    expr_names = {}
    expr_values = {}

    for i, (key, val) in enumerate(updates.items()):
        attr = f"#k{i}"
        placeholder = f":v{i}"
        expr_parts.append(f"{attr} = {placeholder}")
        expr_names[attr] = key
        if isinstance(val, (dict, list)):
            expr_values[placeholder] = json.dumps(val, ensure_ascii=False)
        elif isinstance(val, float):
            expr_values[placeholder] = Decimal(str(val))
        else:
            expr_values[placeholder] = val

    _table.update_item(
        Key={"id": note_id},
        UpdateExpression="SET " + ", ".join(expr_parts),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
    )
    logger.info(f"Updated delivery note {note_id}: {list(updates.keys())}")


def mark_sent(note_id, docno):
    """Mark a delivery note as sent to Priority."""
    update_delivery_note(note_id, {"status": "sent", "docno": docno})


def mark_error(note_id, error_msg):
    """Mark a delivery note as failed."""
    update_delivery_note(note_id, {"status": "error", "error": error_msg})


def delete_delivery_note(note_id):
    """Delete a delivery note."""
    _table.delete_item(Key={"id": note_id})
    logger.info(f"Deleted delivery note {note_id}")


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
    _JSON_FIELDS = ("items", "parts", "rows", "filters")
    data = {}
    for k, v in item.items():
        if isinstance(v, Decimal):
            data[k] = int(v) if v == int(v) else float(v)
        elif isinstance(v, str) and k in _JSON_FIELDS:
            try:
                data[k] = json.loads(v)
            except (json.JSONDecodeError, TypeError):
                data[k] = v
        else:
            data[k] = v
    return data


# ── Parts Cache (stored as a special record in the same table) ────────

PARTS_CACHE_ID = "PARTS_CACHE"


def save_parts_cache(parts):
    """Save parts list to DB cache."""
    now = datetime.utcnow().isoformat() + "Z"
    item = _prepare_item({
        "id": PARTS_CACHE_ID,
        "status": "_cache",
        "parts": parts,
        "synced_at": now,
        "created_at": now,
        "updated_at": now,
    })
    _table.put_item(Item=item)
    logger.info(f"Saved {len(parts)} parts to cache")


def load_parts_cache():
    """Load parts list from DB cache. Returns {parts, synced_at} or None."""
    resp = _table.get_item(Key={"id": PARTS_CACHE_ID})
    item = resp.get("Item")
    if not item:
        return None
    data = _deserialize_item(item)
    return {"parts": data.get("parts", []), "synced_at": data.get("synced_at", "")}


# ── HR Sheet Cache (stored as special records in the same table) ──────


def save_hr_sheet(sheet_name, rows, filters):
    """Save HR sheet data to DB cache."""
    now = datetime.utcnow().isoformat() + "Z"
    cache_id = f"HR_SHEET_{sheet_name}"
    item = _prepare_item({
        "id": cache_id,
        "status": "_cache",
        "rows": rows,
        "filters": filters,
        "synced_at": now,
        "created_at": now,
        "updated_at": now,
    })
    _table.put_item(Item=item)
    logger.info(f"Saved HR sheet '{sheet_name}' with {len(rows)} rows to cache")


def load_hr_sheet(sheet_name):
    """Load HR sheet data from DB cache. Returns {rows, filters, synced_at} or None."""
    cache_id = f"HR_SHEET_{sheet_name}"
    resp = _table.get_item(Key={"id": cache_id})
    item = resp.get("Item")
    if not item:
        return None
    data = _deserialize_item(item)
    return {
        "rows": data.get("rows", []),
        "filters": data.get("filters", {}),
        "synced_at": data.get("synced_at", ""),
    }
