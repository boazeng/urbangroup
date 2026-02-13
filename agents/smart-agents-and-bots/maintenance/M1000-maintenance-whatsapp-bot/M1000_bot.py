"""
M1000 - Maintenance WhatsApp Bot
Smart bot that receives WhatsApp messages and processes maintenance requests.

Phase 1: Log incoming messages.
"""

import logging
from datetime import datetime

logger = logging.getLogger("urbangroup.M1000")


def process_message(phone, name, text, msg_type="text"):
    """Process an incoming WhatsApp message.

    Args:
        phone: Sender phone number (e.g. '972542777757')
        name: Sender name (from WhatsApp profile)
        text: Message text
        msg_type: Message type (text, image, audio, etc.)

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

    if msg_type != "text" or not text:
        return None

    return f"[M1000] קיבלנו את ההודעה שלך:\n{text[:200]}"
