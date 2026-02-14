"""
A1000 - Ariel WhatsApp Bot
Placeholder smart bot for the Ariel branch.
Logs incoming messages to DynamoDB and replies with a confirmation.
Custom logic to be added later.
"""

import os
import uuid
import logging
from datetime import datetime

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger("urbangroup.A1000")

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))

ARIEL_MESSAGES_TABLE_NAME = os.environ.get("ARIEL_MESSAGES_TABLE", "urbangroup-ariel-messages-prod")
_ariel_messages_table = _dynamodb.Table(ARIEL_MESSAGES_TABLE_NAME)


def save_message(phone, name, text, msg_type="text", message_id=""):
    """Save an incoming message to the Ariel messages table."""
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

    _ariel_messages_table.put_item(Item=item)
    logger.info(f"Ariel message saved: {item_id} from {phone}")
    return item_id


def process_message(phone, name, text, msg_type="text", message_id="",
                    media_id="", caption=""):
    """Process an incoming WhatsApp message for Ariel.

    Args:
        phone: Sender phone number
        name: Sender name
        text: Message text
        msg_type: Message type (text, image, audio, etc.)
        message_id: WhatsApp message ID
        media_id: Media ID (for images/documents/audio)
        caption: Image caption (if applicable)

    Returns:
        str: Response text to send back, or None for no reply
    """
    # Save to DynamoDB
    save_message(phone, name, text, msg_type, message_id)

    # Placeholder response — replace with custom Ariel logic later
    return "הודעתך התקבלה — צוות אריאל"
