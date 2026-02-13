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

# Lazy-load modules to avoid import failures in environments without AWS/deps
_maint_db = None
_llm = None


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

    # Send to LLM for service call identification (images and text)
    if msg_type in ("image", "text") and (media_id or text):
        try:
            llm = _get_llm()
            result = llm.process(
                msg_type=msg_type,
                text=text,
                media_id=media_id,
                caption=caption,
            )
            if result and result.get("is_service_call"):
                # Save service call to DB with full Priority ERP fields
                try:
                    db = _get_maint_db()

                    # Merge parsed voice-bot data with LLM result
                    custname = (
                        parsed_data.get("מספר מנוי")
                        or result.get("customer_number")
                        or "99999"
                    )
                    cdes = (
                        parsed_data.get("שם הלקוח")
                        or result.get("customer_name")
                        or name
                    )
                    sernum = (
                        parsed_data.get("מספר מכשיר")
                        or result.get("device_number")
                        or ""
                    )
                    contact_name = (
                        parsed_data.get("שם איש קשר")
                        or result.get("contact_name")
                        or ""
                    )

                    # Map branch context to Priority BRANCHNAME code
                    branch_context = result.get("branch_context", "unknown")
                    branchname = BRANCH_MAP.get(branch_context, "001")

                    # Build fault text with phone number
                    description = result.get("description", "")
                    fault_text = f"{description}\nטלפון: {phone}"

                    # Set breakstart if system is down
                    breakstart = ""
                    if result.get("is_system_down"):
                        breakstart = datetime.utcnow().strftime("%Y-%m-%d %H:%M")

                    db.save_service_call(
                        phone=phone,
                        name=name,
                        issue_type=result.get("issue_type", ""),
                        description=description,
                        urgency=result.get("urgency", "medium"),
                        location=result.get("location", ""),
                        summary=result.get("summary", ""),
                        message_id=message_id,
                        media_id=media_id,
                        custname=custname,
                        cdes=cdes,
                        sernum=sernum,
                        branchname=branchname,
                        technicianlogin=_get_technician(),
                        contact_name=contact_name,
                        fault_text=fault_text,
                        breakstart=breakstart,
                    )
                    logger.info(f"[M1000] Service call saved: {result.get('issue_type')} ({result.get('urgency')}) branch={branchname}")
                except Exception as e:
                    logger.error(f"[M1000] Failed to save service call: {e}")

                summary = result.get("summary", "")
                urgency_map = {"low": "נמוכה", "medium": "בינונית", "high": "גבוהה", "critical": "קריטית"}
                urgency_heb = urgency_map.get(result.get("urgency", ""), result.get("urgency", ""))
                return (
                    f"זוהתה קריאת שירות:\n"
                    f"סוג: {result.get('issue_type', 'לא ידוע')}\n"
                    f"דחיפות: {urgency_heb}\n"
                    f"{summary}"
                )

            elif result:
                # LLM analyzed but not a service call
                summary = result.get("summary", "")
                if summary:
                    return summary

        except Exception as e:
            logger.error(f"[M1000] LLM analysis failed: {e}")

        if msg_type == "image":
            return "קיבלנו את התמונה. לא זוהתה תקלה."

    if msg_type != "text" or not text:
        return None

    return f"[M1000] קיבלנו את ההודעה שלך:\n{text[:200]}"
