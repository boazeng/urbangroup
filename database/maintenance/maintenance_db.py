"""
maintenance_db - DynamoDB storage for the maintenance module.

Two tables:
  1. Messages table (urbangroup-messages-{stage})
     - All incoming WhatsApp messages (text, image, audio, etc.)
     - PK: id (UUID), GSI: status-created_at-index

  2. Service Calls table (urbangroup-service-calls-{stage})
     - Service calls identified by LLM analysis
     - PK: id (UUID), GSI: status-created_at-index, phone-created_at-index
"""

import os
import uuid
import logging
from datetime import datetime

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger("urbangroup.maintenance_db")

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))

# ── Messages Table ───────────────────────────────────────────

MESSAGES_TABLE_NAME = os.environ.get("MESSAGES_TABLE", "urbangroup-messages-prod")
_messages_table = _dynamodb.Table(MESSAGES_TABLE_NAME)


def save_message(phone, name, text, msg_type="text", message_id="", parsed_data=None):
    """Save an incoming WhatsApp message.

    Args:
        phone: Sender phone number
        name: Sender name
        text: Message text
        msg_type: Message type (text, image, audio, etc.)
        message_id: WhatsApp message ID (wamid)
        parsed_data: Dict of parsed key-value fields (optional)

    Returns:
        dict with saved item id
    """
    now = datetime.utcnow().isoformat() + "Z"
    item_id = str(uuid.uuid4())

    item = {
        "id": item_id,
        "phone": phone,
        "name": name,
        "text": text,
        "msg_type": msg_type,
        "message_id": message_id,
        "status": "new",
        "created_at": now,
    }

    if parsed_data:
        item["parsed_data"] = parsed_data

    _messages_table.put_item(Item=item)
    logger.info(f"Saved message {item_id} from {phone}")
    return {"id": item_id}


def get_messages(status=None, limit=50):
    """Retrieve messages, optionally filtered by status.

    Args:
        status: Filter by status (new, processing, completed, failed). None = all.
        limit: Max items to return.

    Returns:
        list of message dicts, sorted by created_at descending
    """
    if status:
        resp = _messages_table.query(
            IndexName="status-created_at-index",
            KeyConditionExpression=Key("status").eq(status),
            ScanIndexForward=False,
            Limit=limit,
        )
    else:
        resp = _messages_table.scan(Limit=limit)

    items = resp.get("Items", [])
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


def update_message_status(item_id, new_status):
    """Update the status of a message.

    Args:
        item_id: The message UUID
        new_status: New status (new, processing, completed, failed)

    Returns:
        Updated item
    """
    resp = _messages_table.update_item(
        Key={"id": item_id},
        UpdateExpression="SET #s = :status, updated_at = :now",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":status": new_status,
            ":now": datetime.utcnow().isoformat() + "Z",
        },
        ReturnValues="ALL_NEW",
    )
    logger.info(f"Updated message {item_id} status to {new_status}")
    return resp.get("Attributes", {})


# ── Service Calls Table ──────────────────────────────────────

SERVICE_CALLS_TABLE_NAME = os.environ.get("SERVICE_CALLS_TABLE", "urbangroup-service-calls-prod")
_service_calls_table = _dynamodb.Table(SERVICE_CALLS_TABLE_NAME)


def save_service_call(phone, name, issue_type, description, urgency,
                      location="", summary="", message_id="", media_id="",
                      source_type="whatsapp"):
    """Save a new service call identified by the LLM.

    Args:
        phone: Customer phone number
        name: Customer name
        issue_type: Type of issue (נזילה, שבר, תקלת חשמל, etc.)
        description: Issue description from LLM
        urgency: low/medium/high/critical
        location: Location if identified
        summary: Short summary for customer reply
        message_id: Original WhatsApp message ID
        media_id: WhatsApp media ID (if image)
        source_type: Source (whatsapp, phone, etc.)

    Returns:
        dict with saved item id
    """
    now = datetime.utcnow().isoformat() + "Z"
    item_id = str(uuid.uuid4())

    item = {
        "id": item_id,
        "phone": phone,
        "name": name,
        "issue_type": issue_type,
        "description": description,
        "urgency": urgency,
        "location": location or "",
        "summary": summary or "",
        "message_id": message_id,
        "media_id": media_id,
        "source_type": source_type,
        "status": "new",
        "created_at": now,
    }

    _service_calls_table.put_item(Item=item)
    logger.info(f"Saved service call {item_id}: {issue_type} ({urgency}) from {phone}")
    return {"id": item_id}


def get_service_calls(status=None, phone=None, limit=50):
    """Retrieve service calls, optionally filtered.

    Args:
        status: Filter by status (new, assigned, in_progress, completed). None = all.
        phone: Filter by phone number. None = all.
        limit: Max items to return.

    Returns:
        list of service call dicts, sorted by created_at descending
    """
    if status:
        resp = _service_calls_table.query(
            IndexName="status-created_at-index",
            KeyConditionExpression=Key("status").eq(status),
            ScanIndexForward=False,
            Limit=limit,
        )
    elif phone:
        resp = _service_calls_table.query(
            IndexName="phone-created_at-index",
            KeyConditionExpression=Key("phone").eq(phone),
            ScanIndexForward=False,
            Limit=limit,
        )
    else:
        resp = _service_calls_table.scan(Limit=limit)

    items = resp.get("Items", [])
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


def update_service_call_status(item_id, new_status):
    """Update the status of a service call.

    Args:
        item_id: The service call UUID
        new_status: New status (new, assigned, in_progress, completed, cancelled)

    Returns:
        Updated item
    """
    resp = _service_calls_table.update_item(
        Key={"id": item_id},
        UpdateExpression="SET #s = :status, updated_at = :now",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":status": new_status,
            ":now": datetime.utcnow().isoformat() + "Z",
        },
        ReturnValues="ALL_NEW",
    )
    logger.info(f"Updated service call {item_id} status to {new_status}")
    return resp.get("Attributes", {})
