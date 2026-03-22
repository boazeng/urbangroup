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

# Voice bot phone numbers — messages from these skip interactive flow
VOICE_BOT_PHONES = os.environ.get("VOICE_BOT_PHONES", "97237630994").split(",")

# Lazy-load modules to avoid import failures in environments without AWS/deps
_maint_db = None
_llm = None
_equipment_reader = None
_service_call_writer = None


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


def _get_service_call_writer():
    global _service_call_writer
    if _service_call_writer is None:
        try:
            from agents.specific_mission_agents.priority_specific_agents import service_call_writer_300
            _service_call_writer = service_call_writer_300
        except ImportError:
            import importlib.util
            w_path = os.path.join(
                os.path.dirname(__file__), "..", "..", "..",
                "specific-mission-agents", "priority-specific-agents",
                "300-service-call", "300-service_call_writer.py",
            )
            w_path = os.path.normpath(w_path)
            spec = importlib.util.spec_from_file_location("service_call_writer_300", w_path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            _service_call_writer = mod
    return _service_call_writer


# ── Priority ERP field mapping helpers ────────────────────────

BRANCH_MAP = {
    "energy": "108",
    "parking": "026",
    "unknown": "001",
}


def _get_technician():
    """Return default technician login."""
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


def _is_demo_env():
    """Check if running against the demo Priority environment."""
    url = os.environ.get("PRIORITY_URL_DEMO", "") or os.environ.get("PRIORITY_URL", "")
    real = os.environ.get("PRIORITY_URL_REAL", "")
    current = os.environ.get("PRIORITY_URL", "")
    if current and real and current == real:
        return False
    return True


def _handle_voice_bot(phone, name, text, msg_type, message_id, media_id,
                      llm_result, parsed_data, device_number, customer_number,
                      customer_name):
    """Create a service call directly for voice bot messages (no interactive flow).

    Returns:
        dict with 'voice_bot_handled' key and the service call result.
    """
    maint_db = _get_maint_db()

    description = (
        llm_result.get("description", "")
        or parsed_data.get("תיאור", "")
        or (text if text != "[תמונה]" else "")
    )
    location = llm_result.get("location", "") or parsed_data.get("כתובת", "")
    is_system_down = llm_result.get("is_system_down", False)
    issue_type = llm_result.get("issue_type", "תקלה") or "תקלה"

    fault_lines = []
    if description:
        fault_lines.append(description)
    fault_lines.append(f"טלפון: {phone}")
    fault_lines.append(f"מקור: בוט קולי ({name})")
    if customer_name:
        fault_lines.append(f"לקוח: {customer_name}")
    if location:
        fault_lines.append(f"מיקום: {location}")
    if device_number:
        fault_lines.append(f"מכשיר: {device_number}")
    if is_system_down:
        fault_lines.append("מערכת מושבתת: כן")
    fault_text = "\n".join(fault_lines)

    call_data = dict(
        phone=phone,
        name=name,
        issue_type=issue_type,
        description=description or f"קריאה מבוט קולי - {name}",
        urgency="high" if is_system_down else "medium",
        location=location,
        summary=description or f"קריאה מבוט קולי - {name}",
        message_id=message_id,
        media_id=media_id,
        custname=customer_number or "99999",
        cdes=customer_name or name,
        sernum=device_number,
        branchname="001",
        technicianlogin=_get_technician(),
        fault_text=fault_text,
        is_system_down=is_system_down,
    )

    result = maint_db.save_service_call(**call_data)
    call_id = result.get("id", "")
    priority_callno = ""

    try:
        writer = _get_service_call_writer()
        call_data["callstatuscode"] = "ממתין לאישור"
        priority_result = writer.create_service_call(call_data)
        priority_callno = str(priority_result.get("DOCNO", ""))
        maint_db.mark_service_call_pushed(call_id, callno=priority_callno)
        logger.info(f"[M1000] Voice bot: auto-pushed to Priority DOCNO={priority_callno}")
    except Exception as e:
        logger.error(f"[M1000] Voice bot: auto-push to Priority failed: {e}")

    logger.info(f"[M1000] Voice bot service call created: {priority_callno or call_id}")
    return {
        "voice_bot_handled": True,
        "call_id": call_id,
        "priority_callno": priority_callno,
    }


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

    # If phone lookup found nothing, try by device serial number from QR message
    if not equipment_list and parsed_data.get("מספר מכשיר"):
        sernum = parsed_data["מספר מכשיר"].strip()
        try:
            eq_reader = _get_equipment_reader()
            device = eq_reader.fetch_equipment_by_sernum(sernum)
            if device:
                equipment_list = [device]
                device_number = device["sernum"]
                customer_number = device["custname"]
                customer_name = device["cdes"]
                logger.info(f"[M1000] Device identified by sernum {sernum}: {device_number} for {customer_name}")
            else:
                logger.info(f"[M1000] Device sernum {sernum} not found in Priority")
        except Exception as e:
            logger.error(f"[M1000] Equipment lookup by sernum failed: {e}")

    # Voice bot: create service call directly without interactive flow
    if phone in VOICE_BOT_PHONES:
        logger.info(f"[M1000] Voice bot detected ({phone}), creating service call directly")
        return _handle_voice_bot(
            phone=phone, name=name, text=text, msg_type=msg_type,
            message_id=message_id, media_id=media_id,
            llm_result=llm_result, parsed_data=parsed_data,
            device_number=device_number, customer_number=customer_number,
            customer_name=customer_name,
        )

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
