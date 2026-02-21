"""
M10010 - Troubleshooting Script Bot
Conducts structured WhatsApp conversations with customers.
Identifies customer by phone, determines intent (report fault / leave message),
collects device info and fault description, opens service call.

Flow:
  Message arrives → M1000 saves to DB → hands off to M10010
  M10010 greets customer by name → asks intent:
    - "להשאיר הודעה" → collect message → done
    - "לדווח על תקלה" → if device known skip to fault description
      → else ask device number → if no, ask address → collect fault → open service call
"""

import os
import uuid
import time
import logging
from datetime import datetime

logger = logging.getLogger("urbangroup.M10010")

# Lazy-load DB modules
_session_db = None
_maint_db = None

SESSION_TTL_SECONDS = 30 * 60  # 30 minutes

STEPS = [
    "GREETING",        # Greet customer, ask intent (fault / message)
    "GET_MESSAGE",     # Collect free-text message (non-fault track)
    "ASK_DEVICE",      # "יש לך מספר מכשיר?" buttons: כן/לא
    "DEVICE_INPUT",    # Collect device number (free text)
    "ASK_ADDRESS",     # Collect address to find device (free text)
    "DESCRIBE_FAULT",  # Collect fault description (free text)
    "DONE_MESSAGE",    # Terminal: message saved
    "DONE_FAULT",      # Terminal: service call opened
]


def _get_session_db():
    global _session_db
    if _session_db is None:
        try:
            from database.maintenance import troubleshoot_sessions_db
            _session_db = troubleshoot_sessions_db
        except ImportError:
            import importlib.util
            db_path = os.path.join(
                os.path.dirname(__file__), "..", "..", "..", "..",
                "database", "maintenance", "troubleshoot_sessions_db.py",
            )
            db_path = os.path.normpath(db_path)
            spec = importlib.util.spec_from_file_location("troubleshoot_sessions_db", db_path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            _session_db = mod
    return _session_db


def _get_maint_db():
    global _maint_db
    if _maint_db is None:
        try:
            from database.maintenance import maintenance_db
            _maint_db = maintenance_db
        except ImportError:
            import importlib.util
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


def _get_technician():
    """Return default technician login based on Priority environment."""
    url = os.environ.get("PRIORITY_URL", "")
    if "ebyael" in url:
        return "צחי"
    return "יוסי"


def _lookup_customer(phone):
    """Look up customer by phone number in DynamoDB service calls history.

    Returns:
        dict: {"name": "...", "customer_number": "...", "device_number": "..."} or empty dict
    """
    try:
        db = _get_maint_db()
        calls = db.get_service_calls(phone=phone, limit=5)
        if calls:
            latest = calls[0]
            return {
                "name": latest.get("cdes") or latest.get("name", ""),
                "customer_number": latest.get("custname", ""),
                "device_number": latest.get("sernum", ""),
            }
    except Exception as e:
        logger.error(f"[M10010] Customer lookup failed for {phone}: {e}")
    return {}


# ── Step Message Builders ─────────────────────────────────────

def _build_step_message(step, data):
    """Build the message and optional buttons for a given step.

    Returns:
        dict: {"text": "...", "buttons": [...] or None}
    """
    if step == "GREETING":
        name = data.get("customer_name", "")
        if name:
            greeting = f"שלום {name}! כאן הבוט החכם של חברת האחזקה."
        else:
            greeting = "שלום! כאן הבוט החכם של חברת האחזקה."

        return {
            "text": f"{greeting}\nמה תרצה לעשות?",
            "buttons": [
                {"id": "intent_fault", "title": "לדווח על תקלה"},
                {"id": "intent_message", "title": "להשאיר הודעה"},
            ],
        }

    if step == "GET_MESSAGE":
        return {
            "text": "שלח את ההודעה שלך:",
            "buttons": None,
        }

    if step == "ASK_DEVICE":
        return {
            "text": "האם יש לך את מספר המכשיר/המתקן?",
            "buttons": [
                {"id": "device_yes", "title": "כן, יש לי"},
                {"id": "device_no", "title": "לא"},
            ],
        }

    if step == "DEVICE_INPUT":
        return {
            "text": "שלח את מספר המכשיר/המתקן:",
            "buttons": None,
        }

    if step == "ASK_ADDRESS":
        return {
            "text": "באיזה כתובת נמצא המתקן?\n(נשתמש בכתובת כדי לאתר את המכשיר)",
            "buttons": None,
        }

    if step == "DESCRIBE_FAULT":
        return {
            "text": "תאר בקצרה את התקלה:",
            "buttons": None,
        }

    return {"text": "שגיאה פנימית", "buttons": None}


# ── Step Input Processing ─────────────────────────────────────

def _process_step_input(step, data, text, msg_type):
    """Process user input for the current step.

    Returns:
        str: next step to advance to, or None if input is invalid.
    Updates data dict in-place with collected info.
    """
    if step == "GREETING":
        if text == "intent_fault":
            # If device number already known from history, skip device questions
            if data.get("device_number"):
                return "DESCRIBE_FAULT"
            return "ASK_DEVICE"
        if text == "intent_message":
            return "GET_MESSAGE"
        return None

    if step == "GET_MESSAGE":
        if msg_type in ("text", "interactive") and text and not text.startswith("["):
            data["customer_message"] = text
            return "DONE_MESSAGE"
        return None

    if step == "ASK_DEVICE":
        if text == "device_yes":
            return "DEVICE_INPUT"
        if text == "device_no":
            return "ASK_ADDRESS"
        return None

    if step == "DEVICE_INPUT":
        if msg_type in ("text", "interactive") and text and not text.startswith("["):
            data["device_number"] = text
            return "DESCRIBE_FAULT"
        return None

    if step == "ASK_ADDRESS":
        if msg_type in ("text", "interactive") and text and not text.startswith("["):
            data["location"] = text
            return "DESCRIBE_FAULT"
        return None

    if step == "DESCRIBE_FAULT":
        if msg_type in ("text", "interactive") and text and not text.startswith("["):
            data["description"] = text
            return "DONE_FAULT"
        return None

    return None


# ── Public API ────────────────────────────────────────────────

def get_active_session(phone):
    """Check if phone has an active (non-expired) troubleshooting session.

    Returns:
        dict session data, or None.
    """
    db = _get_session_db()
    session = db.get_session(phone)
    if session and session.get("step") not in ("DONE_MESSAGE", "DONE_FAULT", None):
        if session.get("expires_at", 0) > time.time():
            return session
    return None


def start_session(phone, name, parsed_data=None, message_id="", media_id="",
                  original_text="", llm_result=None):
    """Start a new troubleshooting session.

    Returns:
        dict: {"text": "...", "buttons": [...]} for the greeting question.
    """
    db = _get_session_db()
    now = datetime.utcnow().isoformat() + "Z"

    # Look up customer by phone in service calls history
    customer_info = _lookup_customer(phone)

    customer_name = customer_info.get("name", "") or name

    session_data = {
        "phone": phone,
        "session_id": str(uuid.uuid4()),
        "name": name,
        "step": "GREETING",
        "created_at": now,
        "updated_at": now,
        "expires_at": int(time.time()) + SESSION_TTL_SECONDS,
        "customer_name": customer_name,
        "customer_number": customer_info.get("customer_number", ""),
        "device_number": customer_info.get("device_number", ""),
        "location": "",
        "description": "",
        "customer_message": "",
        "original_text": original_text,
        "original_message_id": message_id,
        "original_media_id": media_id,
        "parsed_data": parsed_data or {},
        "llm_result": llm_result or {},
    }

    db.save_session(session_data)
    logger.info(f"[M10010] Session started for {phone}, customer={customer_name}")

    return _build_step_message("GREETING", session_data)


def process_message(phone, text, msg_type="text", caption=""):
    """Process an incoming message for an active troubleshooting session.

    Returns:
        dict: {"text": "...", "buttons": [...]} or {"text": "..."} or None
    """
    db = _get_session_db()
    session = db.get_session(phone)

    if not session:
        return None

    current_step = session.get("step", "GREETING")
    logger.info(f"[M10010] Processing {phone} step={current_step} input={text[:50]}")

    next_step = _process_step_input(current_step, session, text, msg_type)

    if next_step is None:
        # Invalid input - re-send current step prompt with a nudge
        msg = _build_step_message(current_step, session)
        if msg.get("buttons"):
            msg["text"] = "אנא בחר אחת מהאפשרויות:\n\n" + msg["text"]
        return msg

    if next_step == "DONE_MESSAGE":
        _save_customer_message(session)
        db.update_session_step(phone, "DONE_MESSAGE")
        logger.info(f"[M10010] Message collected from {phone}")
        return {"text": "ההודעה התקבלה, תודה! נחזור אליך בהקדם."}

    if next_step == "DONE_FAULT":
        service_call_id = _save_completed_service_call(session)
        db.update_session_step(phone, "DONE_FAULT")
        logger.info(f"[M10010] Service call opened for {phone}, id={service_call_id}")
        return {"text": "נפתחה קריאת שירות! ניצור איתך קשר בהקדם. תודה!"}

    # Advance to next step
    session["step"] = next_step
    session["updated_at"] = datetime.utcnow().isoformat() + "Z"
    session["expires_at"] = int(time.time()) + SESSION_TTL_SECONDS
    db.update_session(phone, session)

    return _build_step_message(next_step, session)


def _save_customer_message(session):
    """Save a non-fault customer message to DynamoDB as a service call record."""
    maint_db = _get_maint_db()
    phone = session.get("phone", "")
    name = session.get("customer_name", "") or session.get("name", "")
    message = session.get("customer_message", "")

    maint_db.save_service_call(
        phone=phone,
        name=name,
        issue_type="הודעה",
        description=message,
        urgency="low",
        location="",
        summary=message,
        message_id=session.get("original_message_id", ""),
        custname=session.get("customer_number", "") or "99999",
        cdes=name,
        technicianlogin=_get_technician(),
    )


def _save_completed_service_call(session):
    """Save completed fault report as a service call in DynamoDB.

    Returns:
        str: service call ID
    """
    maint_db = _get_maint_db()

    phone = session.get("phone", "")
    name = session.get("customer_name", "") or session.get("name", "")
    description = session.get("description", "")

    fault_text = f"{description}\nטלפון: {phone}"
    if session.get("location"):
        fault_text += f"\nמיקום: {session['location']}"
    if session.get("device_number"):
        fault_text += f"\nמכשיר: {session['device_number']}"

    result = maint_db.save_service_call(
        phone=phone,
        name=name,
        issue_type="תקלה",
        description=description,
        urgency="medium",
        location=session.get("location", ""),
        summary=description,
        message_id=session.get("original_message_id", ""),
        media_id=session.get("original_media_id", ""),
        custname=session.get("customer_number", "") or "99999",
        cdes=name,
        sernum=session.get("device_number", ""),
        branchname="001",
        technicianlogin=_get_technician(),
        fault_text=fault_text,
    )

    return result.get("id", "")
