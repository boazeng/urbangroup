"""
M1000_db - DynamoDB storage for WhatsApp maintenance messages.

Table: urbangroup-messages-{stage}
  PK: id (UUID)
  GSI: status-created_at-index (status + created_at)
"""

import os
import uuid
import logging
from datetime import datetime

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger("urbangroup.M1000.db")

# Table name: from env var (Lambda) or default (local)
TABLE_NAME = os.environ.get("MESSAGES_TABLE", "urbangroup-messages-prod")

# DynamoDB resource (uses IAM role in Lambda, AWS CLI creds locally)
_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))
_table = _dynamodb.Table(TABLE_NAME)


def save_message(phone, name, text, msg_type="text", message_id="", parsed_data=None):
    """Save an incoming WhatsApp message to DynamoDB.

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

    _table.put_item(Item=item)
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
        resp = _table.query(
            IndexName="status-created_at-index",
            KeyConditionExpression=Key("status").eq(status),
            ScanIndexForward=False,
            Limit=limit,
        )
    else:
        resp = _table.scan(Limit=limit)

    items = resp.get("Items", [])

    # Sort by created_at descending (scan doesn't guarantee order)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


def update_status(item_id, new_status):
    """Update the status of a message.

    Args:
        item_id: The message UUID
        new_status: New status (new, processing, completed, failed)

    Returns:
        Updated item
    """
    resp = _table.update_item(
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
