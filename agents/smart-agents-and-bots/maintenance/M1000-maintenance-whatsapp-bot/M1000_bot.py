"""
M1000 - Maintenance WhatsApp Bot
Smart bot that receives WhatsApp messages and processes maintenance requests.

Phase 2: Log incoming messages and save to DynamoDB.
"""

import logging
from datetime import datetime

logger = logging.getLogger("urbangroup.M1000")

# Lazy-load db module to avoid boto3 import failure in environments without AWS
_db = None


def _get_db():
    global _db
    if _db is None:
        try:
            from . import M1000_db
            _db = M1000_db
        except ImportError:
            import importlib.util
            import os
            db_path = os.path.join(os.path.dirname(__file__), "M1000_db.py")
            spec = importlib.util.spec_from_file_location("M1000_db", db_path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            _db = mod
    return _db


def parse_message(text):
    """Parse structured voice-bot message into key-value dict.

    Expected format:
        מתקני חניה- לקוח קיים

        מספר מנוי:5828
        שעת שיחה:10:03:48
        תאריך שיחה:2026-02-13
        שם הלקוח:תמר שלום
        ...

    Returns:
        dict with parsed fields, or empty dict if not structured
    """
    parsed = {}
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # Find first colon that separates key:value (skip time colons like 10:03:48)
        idx = line.find(":")
        if idx > 0 and idx < len(line) - 1:
            key = line[:idx].strip()
            value = line[idx + 1:].strip()
            if key and value:
                parsed[key] = value
    return parsed


def process_message(phone, name, text, msg_type="text", message_id=""):
    """Process an incoming WhatsApp message.

    Args:
        phone: Sender phone number (e.g. '972542777757')
        name: Sender name (from WhatsApp profile)
        text: Message text
        msg_type: Message type (text, image, audio, etc.)
        message_id: WhatsApp message ID

    Returns:
        str: Response text to send back via WhatsApp, or None to skip reply
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    logger.info("=" * 50)
    logger.info(f"[M1000] Incoming message at {timestamp}")
    logger.info(f"  From: {phone} ({name})")
    logger.info(f"  Type: {msg_type}")
    logger.info(f"  Text: {text}")
    logger.info("=" * 50)

    # Parse structured fields from text messages
    parsed_data = parse_message(text) if msg_type == "text" and text else {}

    # Save ALL messages to DynamoDB (text, image, audio, etc.)
    try:
        db = _get_db()
        db.save_message(
            phone=phone,
            name=name,
            text=text or f"[{msg_type}]",
            msg_type=msg_type,
            message_id=message_id,
            parsed_data=parsed_data if parsed_data else None,
        )
        logger.info(f"[M1000] Message saved to DB ({len(parsed_data)} fields parsed)")
    except Exception as e:
        logger.error(f"[M1000] Failed to save to DB: {e}")

    if msg_type != "text" or not text:
        return None

    return f"[M1000] קיבלנו את ההודעה שלך:\n{text[:200]}"
