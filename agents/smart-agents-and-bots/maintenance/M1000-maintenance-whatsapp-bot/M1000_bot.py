"""
M1000 - Maintenance WhatsApp Bot
Smart bot that receives WhatsApp messages and processes maintenance requests.

Phase 2: Log incoming messages and save to DynamoDB.
Phase 3: LLM image analysis via ChatGPT.
Phase 4: Complete Priority ERP field mapping.
"""

import os
import logging
from datetime import datetime

logger = logging.getLogger("urbangroup.M1000")

# The script_id that M10010 will run for new sessions.
# Set ROUTING_SCRIPT_ID env var to override (e.g. your custom routing script).
ROUTING_SCRIPT_ID = os.environ.get("ROUTING_SCRIPT_ID", "maintenance-troubleshoot")

# Lazy-load modules to avoid import failures in environments without AWS/deps
_maint_db = None
_llm = None
_equipment_reader = None


def _get_llm():
    global _llm
    if _llm is None:
        try:
            from agents.LLM.maintenance import MLLM1000_servicecall_identifier as mod
            _llm = mod
        except ImportError:
            import importlib.util
            import os
            llm_path = os.path.join(
                os.path.dirname(__file__), "..", "..", "..", "LLM",
                "maintenance", "MLLM1000-servicecall-identifier",
                "MLLM1000_servicecall_identifier.py",
            )
            llm_path = os.path.normpath(llm_path)
            spec = importlib.util.spec_from_file_location(
                "MLLM1000_servicecall_identifier", llm_path
            )
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            _llm = mod
    return _llm


def _get_maint_db():
    global _maint_db
    if _maint_db is None:
        try:
            from database.maintenance import maintenance_db
            _maint_db = maintenance_db
        except ImportError:
            import importlib.util
            import os
            db_path = os.path.join(
                os.path.dirname(__file__), "..", "..", "..", "..",
                "database", "maintenance", "maintenance_db.py",
            )
            db_path = os.path.normpath(db_path)
            spec = importlib.util.spec_from_file_location("maintenance_db", db_path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            _maint_db = mod
    return _maint_db


def _get_equipment_reader():
    global _equipment_reader
    if _equipment_reader is None:
        try:
            from agents.specific_mission_agents.priority_specific_agents import equipment_reader_600
            _equipment_reader = equipment_reader_600
        except ImportError:
            import importlib.util
            eq_path = os.path.join(
                os.path.dirname(__file__), "..", "..", "..",
                "specific-mission-agents", "priority-specific-agents",
                "600-equipment", "600-equipment_reader.py",
            )
            eq_path = os.path.normpath(eq_path)
            spec = importlib.util.spec_from_file_location("equipment_reader_600", eq_path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            _equipment_reader = mod
    return _equipment_reader


# ── Priority ERP field mapping helpers ────────────────────────

BRANCH_MAP = {
    "energy": "108",
    "parking": "026",
    "unknown": "001",
}


def _get_technician():
    """Return default technician login based on Priority environment."""
    url = os.environ.get("PRIORITY_URL", "")
    if "ebyael" in url:
        return "צחי"
    return "יוסי"


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


def process_message(phone, name, text, msg_type="text", message_id="", media_id="", caption=""):
    """Process an incoming WhatsApp message.

    Args:
        phone: Sender phone number (e.g. '972542777757')
        name: Sender name (from WhatsApp profile)
        text: Message text
        msg_type: Message type (text, image, audio, etc.)
        message_id: WhatsApp message ID
        media_id: WhatsApp media ID (for images/documents/audio)
        caption: Image caption if provided

    Returns:
        str: Response text to send back via WhatsApp, or None to skip reply
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    logger.info("=" * 50)
    logger.info(f"[M1000] Incoming message at {timestamp}")
    logger.info(f"  From: {phone} ({name})")
    logger.info(f"  Type: {msg_type}")
    logger.info(f"  Text: {text}")
    if media_id:
        logger.info(f"  Media ID: {media_id}")
    logger.info("=" * 50)

    # Parse structured fields from text messages
    parsed_data = parse_message(text) if msg_type == "text" and text else {}

    # Save ALL messages to DynamoDB (text, image, audio, etc.)
    try:
        db = _get_maint_db()
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

    # Try LLM analysis for text/image (enrichment data for M10010)
    llm_result = {}
    if msg_type in ("image", "text") and (media_id or text):
        try:
            llm = _get_llm()
            llm_result = llm.process(
                msg_type=msg_type,
                text=text,
                media_id=media_id,
                caption=caption,
            ) or {}
        except Exception as e:
            logger.error(f"[M1000] LLM analysis failed: {e}")

    # Look up equipment by phone in Priority before handoff
    device_number = ""
    customer_number = ""
    customer_name = ""
    equipment_list = []
    try:
        eq_reader = _get_equipment_reader()
        devices = eq_reader.fetch_equipment_by_phone(phone)
        equipment_list = devices
        if len(devices) == 1:
            device_number = devices[0]["sernum"]
            customer_number = devices[0]["custname"]
            customer_name = devices[0]["cdes"]
            logger.info(f"[M1000] Device identified: {device_number} for {customer_name}")
        elif len(devices) > 1:
            logger.info(f"[M1000] Multiple devices ({len(devices)}) for phone {phone}")
        else:
            logger.info(f"[M1000] No devices found for phone {phone}")
    except Exception as e:
        logger.error(f"[M1000] Equipment lookup failed: {e}")

    # Always hand off to M10010 for structured conversation
    logger.info(f"[M1000] Handing off to M10010 with script_id={ROUTING_SCRIPT_ID}")
    return {
        "handoff": "M10010",
        "script_id": ROUTING_SCRIPT_ID,
        "llm_result": llm_result,
        "parsed_data": parsed_data,
        "original_text": text,
        "device_number": device_number,
        "customer_number": customer_number,
        "customer_name": customer_name,
        "equipment_list": equipment_list,
    }
